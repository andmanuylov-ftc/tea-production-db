import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { fetchPriceListRows, downloadClientPriceList } from '../lib/clientPriceList'
import PageHeader from '../components/PageHeader'
import { useAssortment } from '../contexts/AssortmentContext'
import { Download, FileText, Search, X, FileSpreadsheet, Filter } from 'lucide-react'

// ============================================================================
// Уровни клиентских цен (единый источник истины для всех выгрузок).
// markup = итоговый коэффициент к себестоимости (cost × markup).
// НДС: экран и кнопка «Выгрузить прайс-лист» отображают цены С НДС (×1.22).
// Кнопка «Клиентский прайс-лист» собирает книгу из view pricelist_export_v1
// (цены там без НДС, целые) — НДС накручивается в генераторе при выборе.
// ============================================================================

const TIERS = [
  { key: 'basic',      label: 'Базовый',          markup: 2.70 }, // +170%
  { key: 'opt',        label: 'Опт',              markup: 2.50 }, // +150%
  { key: 'optPlus',    label: 'Опт+',             markup: 2.30 }, // +130%
  { key: 'partner',    label: 'Партнер',          markup: 2.10 }, // +110%
  { key: 'keyPartner', label: 'Ключевой партнер', markup: 1.95 }, // +95%
]

function calcPrice(cost, markup) {
  return Math.round(Number(cost) * markup * 100) / 100
}

// Ставка НДС для выгрузки «Выгрузить прайс-лист» (плоский xlsx).
const VAT_RATE = 1.22 // 22%

function calcPriceWithVat(cost, markup) {
  return Math.round(Number(cost) * markup * VAT_RATE * 100) / 100
}

// ============================================================================

const CATEGORY_SORT = {
  28: 10, 37: 11, 38: 12,
  29: 20, 40: 21, 41: 22,
  30: 30, 42: 31, 43: 32, 44: 33,
  31: 40,
  32: 50,
  39: 55,
  33: 60, 34: 61, 45: 62, 46: 63,
  35: 70, 47: 71, 48: 72,
}

function getCategorySort(typeId) {
  return CATEGORY_SORT[typeId] ?? 500
}

function isPetProduct(name) {
  return (name ?? '').toUpperCase().includes('ПЭТ')
}

function formatWeight(size, unit) {
  if (!size) return '—'
  const n = Number(size)
  if (unit === 'кг') return Math.round(n * 1000)
  if (unit === 'г')  return Math.round(n)
  return `${size} ${unit}`
}

function fmt(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Checkbox({ checked, indeterminate, onChange, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={`w-4 h-4 rounded border border-forest-light/50 bg-forest-dark accent-gold cursor-pointer ${className}`}
    />
  )
}

function cellAddr(r, c) {
  return XLSX.utils.encode_cell({ r, c })
}

export default function PriceListsAdmin() {
  const [rows, setRows]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [exportingClient, setExportingClient] = useState(false)
  const [showVatModal, setShowVatModal] = useState(false)
  const [showClientVatModal, setShowClientVatModal] = useState(false)
  const [typeNames, setTypeNames]   = useState({})
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(new Set())
  const [needsCheck, setNeedsCheck] = useState(new Set())
  const [descriptions, setDescriptions] = useState({})
  const { assortment } = useAssortment()
  const isStm = assortment?.code === 'STM'
  const [productClient, setProductClient] = useState({}) // product_id -> client_id
  const [clientNames, setClientNames]     = useState({}) // client_id -> name
  const [clientFilter, setClientFilter]   = useState('') // '' = все клиенты (только СТМ)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setClientFilter('')
    loadData()
    return () => { mounted.current = false }
  }, [assortment?.id])

  async function loadData() {
    setLoading(true)

    const [skuRes, typesRes, descRes] = await Promise.all([
      supabase
        .from('sku_cost')
        .select('product_id, sku_article, product_name, package_size, package_unit, total_sku_cost')
        .order('sku_article'),
      supabase.from('product_types').select('id, name'),
      supabase
        .from('product_descriptions')
        .select('product_id, description, products(article)')
        .not('description', 'is', null),
    ])

    if (!mounted.current) return

    const { data: productsData } = await supabase
      .from('products')
      .select('id, article, type_id')

    if (!mounted.current) return

    const typeMap = {}
    ;(typesRes.data ?? []).forEach(t => { typeMap[t.id] = t.name })
    setTypeNames(typeMap)

    const productTypeMap = {}
    ;(productsData ?? []).forEach(p => { productTypeMap[p.id] = p.type_id })

    const descMap = {}
    ;(descRes.data ?? []).forEach(d => {
      if (d.products?.article) descMap[d.products.article] = d.description
    })
    setDescriptions(descMap)

    // Привязка к активному направлению (+ клиенты для СТМ)
    let allowedIds = null
    const prodClient = {}
    const clientMap = {}
    if (assortment?.id) {
      const { data: ap } = await supabase
        .from('assortment_products')
        .select('product_id, client_id')
        .eq('assortment_id', assortment.id)
      if (!mounted.current) return
      allowedIds = new Set((ap ?? []).map(r => r.product_id))
      const usedClients = new Set()
      ;(ap ?? []).forEach(r => {
        if (r.client_id) { prodClient[r.product_id] = r.client_id; usedClients.add(r.client_id) }
      })
      if (usedClients.size) {
        const { data: cl } = await supabase.from('clients').select('id, name')
        ;(cl ?? []).forEach(c => { if (usedClients.has(c.id)) clientMap[c.id] = c.name })
      }
    }
    setProductClient(prodClient)
    setClientNames(clientMap)

    let merged = (skuRes.data ?? []).map(r => ({
      ...r,
      type_id: productTypeMap[r.product_id] ?? null,
    }))
    if (allowedIds) merged = merged.filter(r => allowedIds.has(r.product_id))

    setRows(merged)
    setLoading(false)
  }

  const filteredRows = rows.filter(r => {
    if (isStm && clientFilter && (productClient[r.product_id] || '') !== clientFilter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (r.sku_article ?? '').toLowerCase().includes(q) ||
      (r.product_name ?? '').toLowerCase().includes(q)
    )
  })

  function highlight(text) {
    if (!search.trim() || !text) return text
    const q = search.trim()
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-gold/30 text-cream rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  function groupRowsByClient(rowsToGroup) {
    const byClient = {}
    rowsToGroup.forEach(r => {
      const cid = productClient[r.product_id] || '—'
      const tid = r.type_id ?? 0
      if (!byClient[cid]) byClient[cid] = {}
      if (!byClient[cid][tid]) byClient[cid][tid] = []
      byClient[cid][tid].push(r)
    })
    const clientIds = Object.keys(byClient).sort((a, b) =>
      (clientNames[a] ?? 'Без клиента').localeCompare(clientNames[b] ?? 'Без клиента'))
    const groups = []
    clientIds.forEach(cid => {
      const cname = clientNames[cid] ?? 'Без клиента'
      const tids = Object.keys(byClient[cid]).map(Number)
        .sort((a, b) => getCategorySort(a) - getCategorySort(b))
      tids.forEach(tid => {
        groups.push({
          typeId: `${cid}-${tid}`,
          name: `${cname} · ${typeNames[tid] ?? `Категория ${tid}`}`,
          rows: byClient[cid][tid],
          isPet: false,
        })
      })
    })
    return groups
  }

  function groupRows(rowsToGroup) {
    if (isStm) return groupRowsByClient(rowsToGroup)
    const main = {}
    const pet  = []

    rowsToGroup.forEach(r => {
      if (isPetProduct(r.product_name)) {
        pet.push(r)
      } else {
        const key = r.type_id ?? 0
        if (!main[key]) main[key] = []
        main[key].push(r)
      }
    })

    const sortedKeys = Object.keys(main)
      .map(Number)
      .sort((a, b) => getCategorySort(a) - getCategorySort(b))

    const groups = sortedKeys.map(typeId => ({
      typeId,
      name: typeNames[typeId] ?? `Категория ${typeId}`,
      rows: main[typeId],
      isPet: false,
    }))

    if (pet.length > 0) {
      groups.push({
        typeId: 'pet',
        name: 'Чай в ПЭТ банках',
        rows: pet.sort((a, b) => (a.sku_article ?? '').localeCompare(b.sku_article ?? '')),
        isPet: true,
      })
    }

    return groups
  }

  const groups = groupRows(filteredRows)
  const allVisible = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.sku_article))
  const someVisible = filteredRows.some(r => selected.has(r.sku_article))
  const selCount = selected.size

  // Сводный статус галочек «Уточнить наличие» — для чекбокса в шапке колонки
  const allNeedsCheckVisible  = filteredRows.length > 0 && filteredRows.every(r => needsCheck.has(r.sku_article))
  const someNeedsCheckVisible = filteredRows.some(r => needsCheck.has(r.sku_article))
  const needsCheckCount       = needsCheck.size

  function toggleRow(key) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  function toggleGroup(groupRows) {
    setSelected(prev => {
      const s = new Set(prev)
      const keys = groupRows.map(r => r.sku_article)
      const allOn = keys.every(k => s.has(k))
      if (allOn) keys.forEach(k => s.delete(k))
      else       keys.forEach(k => s.add(k))
      return s
    })
  }

  function toggleAll() {
    setSelected(prev => {
      const s = new Set(prev)
      const keys = filteredRows.map(r => r.sku_article)
      const allOn = keys.every(k => s.has(k))
      if (allOn) keys.forEach(k => s.delete(k))
      else       keys.forEach(k => s.add(k))
      return s
    })
  }

  // -------- «Уточнить наличие» — отдельный набор галочек --------

  function toggleNeedsCheck(key) {
    setNeedsCheck(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  function toggleNeedsCheckGroup(groupRows) {
    setNeedsCheck(prev => {
      const s = new Set(prev)
      const keys = groupRows.map(r => r.sku_article)
      const allOn = keys.every(k => s.has(k))
      if (allOn) keys.forEach(k => s.delete(k))
      else       keys.forEach(k => s.add(k))
      return s
    })
  }

  function toggleNeedsCheckAll() {
    setNeedsCheck(prev => {
      const s = new Set(prev)
      const keys = filteredRows.map(r => r.sku_article)
      const allOn = keys.every(k => s.has(k))
      if (allOn) keys.forEach(k => s.delete(k))
      else       keys.forEach(k => s.add(k))
      return s
    })
  }

  // ---- Простая выгрузка (плоский прайс с 5 клиентскими уровнями, с НДС или без) ----
  function exportToXls(withVat = true) {
    const today = new Date().toLocaleDateString('ru-RU')
    const exportRows = selCount > 0
      ? filteredRows.filter(r => selected.has(r.sku_article))
      : filteredRows

    const exportGroups = groupRows(exportRows)
    // Описание идёт после колонок: №, Артикул, Наим., Вес + N тиров
    const DESC_COL = 4 + TIERS.length

    // Функция расчёта цены (с НДС или без) — единая для всех тиров
    const priceFn = withVat ? calcPriceWithVat : calcPrice
    const vatLabel = withVat ? 'Цены с НДС 22%, по уровням клиентов' : 'Цены без НДС, по уровням клиентов'
    const fileVatLabel = withVat ? 'с НДС' : 'без НДС'

    const sheetData = [
      ['Прайс-лист ПЧК/ADDIS'],
      [`Дата выгрузки: ${today}`],
      [vatLabel],
      [],
    ]

    let globalIdx = 1
    exportGroups.forEach((group, gi) => {
      sheetData.push([group.name])
      sheetData.push([
        '№', 'Артикул', 'Наименование', 'Вес, гр.',
        ...TIERS.map(t => t.label),
        'Описание',
      ])

      group.rows.forEach(item => {
        sheetData.push([
          globalIdx++,
          item.sku_article ?? '—',
          item.product_name ?? '—',
          formatWeight(item.package_size, item.package_unit),
          ...TIERS.map(t => priceFn(item.total_sku_cost, t.markup)),
          descriptions[item.sku_article] ?? '',
        ])
      })

      if (gi < exportGroups.length - 1) sheetData.push([])
    })

    const ws = XLSX.utils.aoa_to_sheet(sheetData)

    ws['!cols'] = [
      { wch: 4  }, { wch: 14 }, { wch: 32 }, { wch: 8  },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
      { wch: 28 },
    ]

    ws['!pageSetup'] = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    }

    ws['!margins'] = {
      left: 0.4, right: 0.4,
      top: 0.6,  bottom: 0.6,
      header: 0.2, footer: 0.2,
    }

    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
    for (let R = range.s.r; R <= range.e.r; R++) {
      const addr = cellAddr(R, DESC_COL)
      if (ws[addr]) {
        ws[addr].s = {
          alignment: {
            horizontal: 'left',
            vertical: 'top',
            wrapText: true,
          },
        }
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист')
    const suffix = selCount > 0 ? ` (${selCount} поз)` : ''
    XLSX.writeFile(wb, `Прайс-лист ПЧК ADDIS ${fileVatLabel}${suffix} ${today.replace(/\./g, '-')}.xlsx`)
  }

  // ---- Клиентский прайс (бланк заказов) — сборка книги из pricelist_export_v1 ----
  async function exportClientPriceList(withVat = true) {
    setExportingClient(true)
    try {
      const exportRows = selCount > 0
        ? filteredRows.filter(r => selected.has(r.sku_article))
        : filteredRows

      const articles = exportRows.map(r => r.sku_article)
      const rowsForFile = await fetchPriceListRows(supabase, articles)

      if (rowsForFile.length === 0) {
        throw new Error('Ни одна из выбранных позиций не размечена для клиентского прайса (раздел / подраздел / группа).')
      }
      const missing = articles.length - rowsForFile.length
      if (missing > 0) {
        console.warn(`Без разметки прайс-листа: ${missing} SKU — они не попадут в файл.`)
      }

      await downloadClientPriceList(rowsForFile, {
        withVat,
        dateStr: new Date().toLocaleDateString('ru-RU'),
        managerName: '',
      })
    } catch (err) {
      console.error('Ошибка выгрузки клиентского прайса:', err)
      alert(`Не удалось сформировать прайс: ${err.message}`)
    } finally {
      setExportingClient(false)
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="ПРАЙС ЛИСТ"
        subtitle="Цены с НДС 22%, по уровням клиентов"
        action={
          <div className="flex items-center gap-2 text-muted text-xs font-body">
            <FileText size={14} />
            <span className="text-cream">{rows.length}</span> позиций
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по артикулу или названию…"
            className="w-full bg-forest-dark border border-forest-light/40 rounded-lg pl-9 pr-8 py-2
                       text-cream text-sm font-body focus:outline-none focus:border-gold/50 placeholder:text-muted"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-cream transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        {isStm && (
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="bg-forest border border-forest-light/40 rounded-lg pl-9 pr-8 py-2
                         text-cream text-sm font-body focus:outline-none focus:border-gold/50
                         appearance-none cursor-pointer"
            >
              <option value="">Все клиенты</option>
              {Object.entries(clientNames)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        )}

        {selCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gold text-xs font-mono">{selCount} выбрано</span>
            <button onClick={() => setSelected(new Set())}
              className="text-muted hover:text-cream transition-colors" title="Снять выделение">
              <X size={13} />
            </button>
          </div>
        )}

        {needsCheckCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-amber-300 text-xs font-mono">{needsCheckCount} уточн.</span>
            <button onClick={() => setNeedsCheck(new Set())}
              className="text-muted hover:text-cream transition-colors" title="Сбросить «Уточнить наличие»">
              <X size={13} />
            </button>
          </div>
        )}

        <button
          onClick={() => setShowVatModal(true)}
          disabled={loading || rows.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/30
                     bg-gold/10 text-gold text-xs font-body font-medium
                     hover:bg-gold/20 hover:border-gold/50 transition-colors whitespace-nowrap
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title="Плоский прайс с 5 уровнями клиентских цен — выбор с НДС или без НДС"
        >
          <Download size={14} />
          {selCount > 0 ? `Выгрузить (${selCount})…` : 'Выгрузить прайс-лист…'}
        </button>

        <button
          onClick={() => setShowClientVatModal(true)}
          disabled={loading || exportingClient || rows.length === 0 || isStm}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40
                     bg-emerald-500/10 text-emerald-300 text-xs font-body font-medium
                     hover:bg-emerald-500/20 hover:border-emerald-500/60 transition-colors whitespace-nowrap
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title={isStm ? 'Клиентский прайс доступен только для основного ассортимента (OLD_TEA)' : 'B2B прайс: разделы, 5 уровней цен, автосборка бланка заказа'}
        >
          <FileSpreadsheet size={14} />
          {exportingClient
            ? 'Готовится…'
            : selCount > 0
              ? `Клиентский прайс (${selCount})`
              : 'Клиентский прайс-лист'}
        </button>
      </div>

      {loading ? (
        <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
      ) : filteredRows.length === 0 ? (
        <div className="card text-center py-12 text-muted text-sm font-body">
          {search ? `Ничего не найдено по запросу «${search}»` : 'Нет данных'}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest-light/20 bg-forest-light/5">
                  <th className="px-4 py-3 w-10">
                    <Checkbox
                      checked={allVisible}
                      indeterminate={!allVisible && someVisible}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-2 py-3 w-8">#</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Артикул</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Наименование</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3">Вес, гр.</th>
                  <th
                    className="text-amber-300 text-xs uppercase tracking-widest font-body text-center px-3 py-3 w-20 whitespace-nowrap"
                    title="«Уточнить наличие» — отмеченные SKU попадут в клиентский прайс со статусом «Уточнить наличие» вместо «В наличии»"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>Уточн.</span>
                      <Checkbox
                        checked={allNeedsCheckVisible}
                        indeterminate={!allNeedsCheckVisible && someNeedsCheckVisible}
                        onChange={toggleNeedsCheckAll}
                      />
                    </div>
                  </th>
                  {TIERS.map(t => (
                    <th key={t.key} className="text-gold text-xs uppercase tracking-widest font-body text-right px-4 py-3 whitespace-nowrap">
                      {t.label}
                    </th>
                  ))}
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Описание</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(group => {
                  const groupAllOn  = group.rows.every(r => selected.has(r.sku_article))
                  const groupSomeOn = group.rows.some(r => selected.has(r.sku_article))
                  const groupNcAllOn  = group.rows.every(r => needsCheck.has(r.sku_article))
                  const groupNcSomeOn = group.rows.some(r => needsCheck.has(r.sku_article))
                  const groupOffset = groups
                    .slice(0, groups.indexOf(group))
                    .reduce((acc, g) => acc + g.rows.length, 0)

                  return (
                    <>
                      <tr key={`group-${group.typeId}`}
                        className={`border-t-2 ${group.isPet ? 'border-amber-500/40 bg-amber-900/10' : 'border-forest-light/30 bg-forest-light/5'}`}>
                        <td className="px-4 py-2.5">
                          <Checkbox
                            checked={groupAllOn}
                            indeterminate={!groupAllOn && groupSomeOn}
                            onChange={() => toggleGroup(group.rows)}
                          />
                        </td>
                        <td colSpan={4} className="px-2 py-2.5">
                          <div className={`flex items-center gap-2 ${group.isPet ? 'text-amber-400' : 'text-gold'}`}>
                            <span className="font-body font-semibold text-sm uppercase tracking-wider">
                              {group.name}
                            </span>
                            <span className="text-muted font-mono text-xs">
                              — {group.rows.length} поз.
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={groupNcAllOn}
                            indeterminate={!groupNcAllOn && groupNcSomeOn}
                            onChange={() => toggleNeedsCheckGroup(group.rows)}
                          />
                        </td>
                        <td colSpan={TIERS.length + 1}></td>
                      </tr>

                      {group.rows.map((item, idx) => {
                        const isChecked = selected.has(item.sku_article)
                        const isNeedsCheck = needsCheck.has(item.sku_article)
                        const globalNum = groupOffset + idx + 1
                        const desc = descriptions[item.sku_article]

                        return (
                          <tr
                            key={item.sku_article}
                            onClick={() => toggleRow(item.sku_article)}
                            className={`border-t border-forest-light/10 cursor-pointer transition-colors
                              ${isChecked
                                ? 'bg-gold/10 hover:bg-gold/15'
                                : idx % 2 !== 0
                                  ? 'bg-forest-light/5 hover:bg-forest-light/10'
                                  : 'hover:bg-forest-light/5'
                              }`}
                          >
                            <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={isChecked}
                                onChange={() => toggleRow(item.sku_article)}
                              />
                            </td>
                            <td className="px-2 py-2.5 text-muted font-mono text-xs text-right">{globalNum}</td>
                            <td className="px-4 py-2.5">
                              <span className="bg-gold/10 text-gold border border-gold/20 font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap">
                                {highlight(item.sku_article ?? '—')}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-cream font-body">
                              {highlight(item.product_name ?? '—')}
                            </td>
                            <td className="px-4 py-2.5 text-muted font-mono text-right whitespace-nowrap">
                              {formatWeight(item.package_size, item.package_unit)}
                            </td>
                            <td
                              className="px-3 py-2.5 text-center"
                              onClick={e => e.stopPropagation()}
                              title={isNeedsCheck
                                ? 'В клиентском прайсе попадёт «Уточнить наличие»'
                                : 'В клиентском прайсе будет «В наличии»'}
                            >
                              <Checkbox
                                checked={isNeedsCheck}
                                onChange={() => toggleNeedsCheck(item.sku_article)}
                              />
                            </td>
                            {TIERS.map((t, ti) => (
                              <td key={t.key} className={`px-4 py-2.5 font-mono text-right whitespace-nowrap ${ti === 0 ? 'text-gold font-medium' : 'text-gold/70'}`}>
                                {fmt(calcPriceWithVat(item.total_sku_cost, t.markup))}
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-xs max-w-xs">
                              {desc
                                ? <span className="text-cream/60 italic font-body">{desc}</span>
                                : <span className="text-muted/30">—</span>
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модалка выбора варианта НДС для выгрузки плоского прайса */}
      {showVatModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowVatModal(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowVatModal(false) }}
        >
          <div
            className="bg-forest-dark border border-forest-light/40 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-cream font-display text-lg uppercase tracking-wider">
                Выгрузка прайс-листа
              </h2>
              <button
                onClick={() => setShowVatModal(false)}
                className="text-muted hover:text-cream transition-colors"
                title="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-muted text-sm font-body mb-5">
              Выберите вариант — цены будут пересчитаны соответственно:
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowVatModal(false); exportToXls(true) }}
                className="flex items-start gap-3 p-4 rounded-lg border border-gold/30 bg-gold/5
                           hover:bg-gold/15 hover:border-gold/60 transition-colors text-left"
              >
                <Download size={18} className="text-gold mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-gold font-body font-medium text-sm">С НДС 22%</div>
                  <div className="text-muted text-xs font-body mt-1">
                    Розничные / клиентские цены с НДС
                  </div>
                </div>
              </button>

              <button
                onClick={() => { setShowVatModal(false); exportToXls(false) }}
                className="flex items-start gap-3 p-4 rounded-lg border border-forest-light/40 bg-forest-light/5
                           hover:bg-forest-light/15 hover:border-forest-light/60 transition-colors text-left"
              >
                <Download size={18} className="text-cream mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-cream font-body font-medium text-sm">Без НДС</div>
                  <div className="text-muted text-xs font-body mt-1">
                    Оптовые / партнёрские цены без НДС
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-end mt-5">
              <button
                onClick={() => setShowVatModal(false)}
                className="px-4 py-2 text-muted hover:text-cream font-body text-xs transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка выбора НДС для клиентского прайса (бланк заказов) */}
      {showClientVatModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowClientVatModal(false)}
        >
          <div
            className="bg-forest-dark border border-forest-light/40 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-cream font-display text-lg uppercase tracking-wider">
                Клиентский прайс-лист
              </h2>
              <button
                onClick={() => setShowClientVatModal(false)}
                className="text-muted hover:text-cream transition-colors"
                title="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-muted text-sm font-body mb-5">
              Файл с разделами, бланком заказа и партнёрской программой. Выберите вариант цен:
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowClientVatModal(false); exportClientPriceList(true) }}
                className="flex items-start gap-3 p-4 rounded-lg border border-emerald-500/40 bg-emerald-500/5
                           hover:bg-emerald-500/15 hover:border-emerald-500/60 transition-colors text-left"
              >
                <FileSpreadsheet size={18} className="text-emerald-300 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-emerald-300 font-body font-medium text-sm">С НДС 22%</div>
                  <div className="text-muted text-xs font-body mt-1">Стандартный клиентский вариант</div>
                </div>
              </button>

              <button
                onClick={() => { setShowClientVatModal(false); exportClientPriceList(false) }}
                className="flex items-start gap-3 p-4 rounded-lg border border-forest-light/40 bg-forest-light/5
                           hover:bg-forest-light/15 hover:border-forest-light/60 transition-colors text-left"
              >
                <FileSpreadsheet size={18} className="text-cream mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-cream font-body font-medium text-sm">Без НДС</div>
                  <div className="text-muted text-xs font-body mt-1">Цены без налога, целые рубли</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
