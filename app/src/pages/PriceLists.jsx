import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Download, FileText, Search, X, FileSpreadsheet } from 'lucide-react'

// ============================================================================
// Старая выгрузка (плоский прайс с тирами по сумме заказа, цены с НДС)
// ============================================================================

const TIERS = [
  { label: 'до 50 000 руб.',       markup: 1.50 },
  { label: '50–100 000 руб.',      markup: 1.35 },
  { label: '100–400 000 руб.',     markup: 1.20 },
  { label: 'от 400 000 руб.',      markup: 1.05 },
]
const VAT = 0.22

function calcPrice(cost, markup) {
  return Math.round(Number(cost) * (1 + markup) * (1 + VAT) * 100) / 100
}

// ============================================================================
// Новая клиентская выгрузка (B2B шаблон с 5 уровнями цен, НДС в бланке заказа)
// ============================================================================

const CLIENT_MARKUPS = {
  basic:       2.70, // Базовый, +170%
  opt:         2.50, // Опт, +150%
  optPlus:     2.30, // Опт+, +130%
  partner:     2.10, // Партнер, +110%
  keyPartner:  1.95, // Ключевой партнер, +95%
}

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

function normalizeGrams(size, unit) {
  if (size === null || size === undefined) return null
  const n = Number(size)
  if (isNaN(n)) return null
  if (unit === 'кг') return Math.round(n * 1000)
  return Math.round(n)
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
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

export default function PriceLists() {
  const [rows, setRows]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [exportingClient, setExportingClient] = useState(false)
  const [typeNames, setTypeNames]   = useState({})
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(new Set())
  const [descriptions, setDescriptions] = useState({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    loadData()
    return () => { mounted.current = false }
  }, [])

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

    const merged = (skuRes.data ?? []).map(r => ({
      ...r,
      type_id: productTypeMap[r.product_id] ?? null,
    }))

    setRows(merged)
    setLoading(false)
  }

  const filteredRows = rows.filter(r => {
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

  function groupRows(rowsToGroup) {
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

  // ---- Старая выгрузка (плоский прайс с НДС) ----
  function exportToXls() {
    const today = new Date().toLocaleDateString('ru-RU')
    const exportRows = selCount > 0
      ? filteredRows.filter(r => selected.has(r.sku_article))
      : filteredRows

    const exportGroups = groupRows(exportRows)
    const DESC_COL = 8

    const sheetData = [
      ['Прайс-лист ПЧК/ADDIS'],
      [`Дата выгрузки: ${today}`],
      ['Все цены указаны с НДС 22%'],
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
          ...TIERS.map(t => calcPrice(item.total_sku_cost, t.markup)),
          descriptions[item.sku_article] ?? '',
        ])
      })

      if (gi < exportGroups.length - 1) sheetData.push([])
    })

    const ws = XLSX.utils.aoa_to_sheet(sheetData)

    ws['!cols'] = [
      { wch: 4  }, { wch: 14 }, { wch: 32 }, { wch: 8  },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
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
    XLSX.writeFile(wb, `Прайс-лист ПЧК ADDIS${suffix} ${today.replace(/\./g, '-')}.xlsx`)
  }

  // ---- Новая клиентская выгрузка (на базе template_price.xlsx, через ExcelJS) ----
  async function exportClientPriceList() {
    setExportingClient(true)
    try {
      const res = await fetch('/template_price.xlsx')
      if (!res.ok) {
        throw new Error(`Шаблон недоступен (${res.status})`)
      }
      const buffer = await res.arrayBuffer()

      // Читаем через ExcelJS — он сохраняет все стили, объединения, page setup, формулы
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)

      const sheet = wb.getWorksheet('Прайс-лист')
      if (!sheet) {
        const names = wb.worksheets.map(w => w.name).join(', ')
        throw new Error(`В шаблоне нет листа «Прайс-лист». Найдены: ${names || '(нет)'}`)
      }

      const exportRows = selCount > 0
        ? filteredRows.filter(r => selected.has(r.sku_article))
        : filteredRows

      const exportGroups = groupRows(exportRows)

      // Собираем плоский список SKU в порядке групп — без строк-разделителей,
      // чтобы не ломать табличную структуру. Категория — в столбце A, клиент может
      // фильтровать/сортировать через AutoFilter в шапке.
      const flatSkus = []
      for (const group of exportGroups) {
        for (const sku of group.rows) {
          flatSkus.push({ ...sku, categoryName: group.name })
        }
      }

      const START_ROW = 11
      const END_ROW = 310
      const MAX_ROWS = END_ROW - START_ROW + 1

      if (flatSkus.length > MAX_ROWS) {
        console.warn(`SKU больше (${flatSkus.length}), чем места в шаблоне (${MAX_ROWS}). Лишние обрежутся.`)
      }

      // Заполняем строки. cell.value = X не затирает стиль ячейки в ExcelJS.
      const fillCount = Math.min(flatSkus.length, MAX_ROWS)
      for (let i = 0; i < fillCount; i++) {
        const sku = flatSkus[i]
        const row = START_ROW + i
        const grams = normalizeGrams(sku.package_size, sku.package_unit)
        const cost = Number(sku.total_sku_cost ?? 0)

        sheet.getCell(`A${row}`).value = sku.categoryName
        sheet.getCell(`B${row}`).value = sku.sku_article ?? ''
        sheet.getCell(`C${row}`).value = sku.product_name ?? ''
        sheet.getCell(`D${row}`).value = descriptions[sku.sku_article] ?? ''
        sheet.getCell(`E${row}`).value = grams ?? 0
        sheet.getCell(`F${row}`).value = 'гр'
        sheet.getCell(`G${row}`).value = 1
        sheet.getCell(`H${row}`).value = 1
        sheet.getCell(`I${row}`).value = round2(cost * CLIENT_MARKUPS.basic)
        sheet.getCell(`J${row}`).value = round2(cost * CLIENT_MARKUPS.opt)
        sheet.getCell(`K${row}`).value = round2(cost * CLIENT_MARKUPS.optPlus)
        sheet.getCell(`L${row}`).value = round2(cost * CLIENT_MARKUPS.partner)
        sheet.getCell(`M${row}`).value = round2(cost * CLIENT_MARKUPS.keyPartner)
        sheet.getCell(`N${row}`).value = 'В наличии'
        // O, P, Q — пустые для клиента; R, S, T — формулы из шаблона (сохраняются).
      }

      // Сохраняем и скачиваем через Blob (ExcelJS возвращает ArrayBuffer)
      const outBuffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([outBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')
      const totalCount = exportRows.length
      const suffix = selCount > 0 ? ` (${totalCount} поз)` : ''
      const fileName = `Клиентский прайс-лист ПЧК${suffix} ${today}.xlsx`

      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
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
        subtitle="Цены с НДС 22%, сгруппированы по видам чая"
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

        {selCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gold text-xs font-mono">{selCount} выбрано</span>
            <button onClick={() => setSelected(new Set())}
              className="text-muted hover:text-cream transition-colors" title="Снять выделение">
              <X size={13} />
            </button>
          </div>
        )}

        <button
          onClick={exportToXls}
          disabled={loading || rows.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/30
                     bg-gold/10 text-gold text-xs font-body font-medium
                     hover:bg-gold/20 hover:border-gold/50 transition-colors whitespace-nowrap
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title="Простой прайс с тирами по сумме заказа (цены с НДС)"
        >
          <Download size={14} />
          {selCount > 0 ? `Выгрузить (${selCount})` : 'Выгрузить прайс-лист'}
        </button>

        <button
          onClick={exportClientPriceList}
          disabled={loading || exportingClient || rows.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40
                     bg-emerald-500/10 text-emerald-300 text-xs font-body font-medium
                     hover:bg-emerald-500/20 hover:border-emerald-500/60 transition-colors whitespace-nowrap
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title="B2B прайс с 5 уровнями цен и автогенерацией бланка заказа"
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
                  {TIERS.map(t => (
                    <th key={t.label} className="text-gold text-xs uppercase tracking-widest font-body text-right px-4 py-3 whitespace-nowrap">
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
                        <td colSpan={4 + TIERS.length + 1} className="px-2 py-2.5">
                          <div className={`flex items-center gap-2 ${group.isPet ? 'text-amber-400' : 'text-gold'}`}>
                            <span className="font-body font-semibold text-sm uppercase tracking-wider">
                              {group.name}
                            </span>
                            <span className="text-muted font-mono text-xs">
                              — {group.rows.length} поз.
                            </span>
                          </div>
                        </td>
                      </tr>

                      {group.rows.map((item, idx) => {
                        const isChecked = selected.has(item.sku_article)
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
                            {TIERS.map((t, ti) => (
                              <td key={ti} className={`px-4 py-2.5 font-mono text-right whitespace-nowrap ${ti === 0 ? 'text-gold font-medium' : 'text-gold/70'}`}>
                                {fmt(calcPrice(item.total_sku_cost, t.markup))}
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
    </div>
  )
}
