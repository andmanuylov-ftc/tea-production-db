import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { ChevronDown, ChevronRight, Download, FileText, Search, X } from 'lucide-react'

const VAT = 0.22

// Порядок категорий в таблице
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

export default function PriceLists() {
  const [lists, setLists]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [openId, setOpenId]             = useState(null)
  const [items, setItems]               = useState({})
  const [loadingItems, setLoadingItems] = useState({})
  const [typeNames, setTypeNames]       = useState({})
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    supabase
      .from('price_lists')
      .select('id, name, markup_percent')
      .order('name')
      .then(({ data }) => {
        if (!mounted.current) return
        setLists(data ?? [])
        setLoading(false)
      })

    supabase
      .from('product_types')
      .select('id, name')
      .then(({ data }) => {
        if (!mounted.current) return
        const map = {}
        ;(data ?? []).forEach(t => { map[t.id] = t.name })
        setTypeNames(map)
      })

    return () => { mounted.current = false }
  }, [])

  async function loadItems(id) {
    if (items[id] || loadingItems[id]) return
    if (!mounted.current) return
    setLoadingItems(prev => ({ ...prev, [id]: true }))

    const { data: pricingData, error } = await supabase
      .from('product_pricing')
      .select('sku_article, product_name, package_size, package_unit, final_price')
      .eq('price_list_id', id)
      .order('sku_article')

    if (error || !mounted.current) {
      setLoadingItems(prev => ({ ...prev, [id]: false }))
      return
    }

    const articles = (pricingData ?? []).map(r => r.sku_article)
    const { data: productsData } = await supabase
      .from('products')
      .select('article, type_id')
      .in('article', articles)

    if (!mounted.current) return

    const typeMap = {}
    ;(productsData ?? []).forEach(p => { typeMap[p.article] = p.type_id })

    const merged = (pricingData ?? []).map(r => ({
      ...r,
      type_id: typeMap[r.sku_article] ?? null,
    }))

    setItems(prev => ({ ...prev, [id]: merged }))
    setLoadingItems(prev => ({ ...prev, [id]: false }))
  }

  function toggleList(id) {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id)
    loadItems(id)
  }

  function fmt(val) {
    if (val == null) return '—'
    return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function filteredRows(listItems) {
    if (!search.trim()) return listItems
    const q = search.toLowerCase()
    return listItems.filter(i =>
      (i.sku_article ?? '').toLowerCase().includes(q) ||
      (i.product_name ?? '').toLowerCase().includes(q)
    )
  }

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

  // Группировка: ПЭТ определяется по слову «ПЭТ» в названии — всегда в отдельный раздел в конце
  function groupRows(rows) {
    const main = {}
    const pet  = []

    rows.forEach(r => {
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

  // ─── Выделение ──────────────────────────────────────────────────────────
  function getSet(listId) { return selected[listId] ?? new Set() }

  function toggleRow(listId, key) {
    setSelected(prev => {
      const s = new Set(prev[listId] ?? [])
      s.has(key) ? s.delete(key) : s.add(key)
      return { ...prev, [listId]: s }
    })
  }

  function toggleGroup(listId, groupRows) {
    setSelected(prev => {
      const s    = new Set(prev[listId] ?? [])
      const keys = groupRows.map(r => r.sku_article)
      const allOn = keys.every(k => s.has(k))
      if (allOn) keys.forEach(k => s.delete(k))
      else       keys.forEach(k => s.add(k))
      return { ...prev, [listId]: s }
    })
  }

  function toggleAll(listId, visibleRows) {
    setSelected(prev => {
      const s    = new Set(prev[listId] ?? [])
      const keys = visibleRows.map(r => r.sku_article)
      const allOn = keys.every(k => s.has(k))
      if (allOn) keys.forEach(k => s.delete(k))
      else       keys.forEach(k => s.add(k))
      return { ...prev, [listId]: s }
    })
  }

  function clearSelection(listId) {
    setSelected(prev => ({ ...prev, [listId]: new Set() }))
  }

  // ─── Экспорт ─────────────────────────────────────────────────────────────
  function exportToXls(list, allRows) {
    const today  = new Date().toLocaleDateString('ru-RU')
    const selSet = getSet(list.id)
    const visible = filteredRows(allRows)
    const exportRows = selSet.size > 0
      ? visible.filter(r => selSet.has(r.sku_article))
      : visible

    const groups = groupRows(exportRows)

    const sheetData = [
      [`${list.name} (+${list.markup_percent}%)`],
      [`Дата выгрузки: ${today}`],
      [],
    ]

    let globalIdx = 1
    groups.forEach((group, gi) => {
      sheetData.push([group.name])
      sheetData.push(['№', 'Артикул', 'Наименование', 'Фасовка', 'Цена без НДС, руб', 'Цена с НДС 22%, руб'])

      group.rows.forEach(item => {
        const priceNoVat = Number(item.final_price) || 0
        const priceVat   = Math.round(priceNoVat * (1 + VAT) * 100) / 100
        const fasovka    = item.package_size ? `${item.package_size} ${item.package_unit}` : '—'
        sheetData.push([
          globalIdx++,
          item.sku_article ?? '—',
          item.product_name ?? '—',
          fasovka,
          Math.round(priceNoVat * 100) / 100,
          priceVat,
        ])
      })

      if (gi < groups.length - 1) sheetData.push([])
    })

    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 20 }, { wch: 22 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист')
    const suffix   = selSet.size > 0 ? ` (${selSet.size} поз)` : ''
    const filename = `${list.name} +${list.markup_percent}%${suffix} ${today.replace(/\./g, '-')}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // ─── Рендер ──────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      <PageHeader
        title="ПРАЙС ЛИСТ"
        subtitle="Цены без НДС и с НДС (22%), сгруппированы по видам чая"
        action={
          <div className="flex items-center gap-2 text-muted text-xs font-body">
            <FileText size={14} />
            {lists.length} прайс-лист{lists.length !== 1 ? 'а' : ''}
          </div>
        }
      />

      {loading ? (
        <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
      ) : lists.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-muted text-sm font-body">Прайс-листов пока нет</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {lists.map(l => {
            const allRows     = items[l.id] ?? []
            const visibleRows = filteredRows(allRows)
            const groups      = groupRows(visibleRows)
            const selSet      = getSet(l.id)
            const selCount    = selSet.size
            const allVisible  = visibleRows.length > 0 && visibleRows.every(r => selSet.has(r.sku_article))
            const someVisible = visibleRows.some(r => selSet.has(r.sku_article))

            return (
              <div key={l.id} className="card overflow-hidden">

                <button
                  onClick={() => toggleList(l.id)}
                  className="w-full flex items-center justify-between py-1 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-3">
                    {openId === l.id
                      ? <ChevronDown size={16} className="text-gold" />
                      : <ChevronRight size={16} className="text-muted" />}
                    <span className="text-cream font-body font-medium text-base">{l.name}</span>
                    <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs px-2 py-0.5 rounded">
                      +{l.markup_percent}%
                    </span>
                  </div>
                  <div className="text-muted text-xs font-mono">
                    {allRows.length > 0 ? `${allRows.length} позиций` : 'нажмите для загрузки'}
                  </div>
                </button>

                {openId === l.id && (
                  <div className="mt-4">
                    <div className="flex items-center gap-3 mb-4">
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
                          <button onClick={() => clearSelection(l.id)}
                            className="text-muted hover:text-cream transition-colors" title="Снять выделение">
                            <X size={13} />
                          </button>
                        </div>
                      )}

                      {allRows.length > 0 && (
                        <button
                          onClick={() => exportToXls(l, allRows)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/30
                                     bg-gold/10 text-gold text-xs font-body font-medium
                                     hover:bg-gold/20 hover:border-gold/50 transition-colors whitespace-nowrap"
                        >
                          <Download size={14} />
                          {selCount > 0 ? `Выгрузить (${selCount})` : 'Выгрузить прайс-лист'}
                        </button>
                      )}
                    </div>

                    <div className="-mx-6 overflow-x-auto">
                      {loadingItems[l.id] ? (
                        <div className="px-6 pb-4 text-muted text-sm font-mono animate-pulse">Загрузка позиций...</div>
                      ) : visibleRows.length === 0 ? (
                        <div className="px-6 pb-4 text-center text-muted text-sm font-body py-8">
                          {search ? `Ничего не найдено по запросу «${search}»` : 'Нет данных'}
                        </div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-t border-forest-light/20">
                              <th className="px-6 py-3 w-10">
                                <Checkbox
                                  checked={allVisible}
                                  indeterminate={!allVisible && someVisible}
                                  onChange={() => toggleAll(l.id, visibleRows)}
                                />
                              </th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-2 py-3 w-8">#</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Артикул</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Наименование</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3">Фасовка</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3 text-gold">Цена без НДС, руб</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-6 py-3 text-gold/70">Цена с НДС 22%, руб</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groups.map(group => {
                              const groupAllOn  = group.rows.every(r => selSet.has(r.sku_article))
                              const groupSomeOn = group.rows.some(r => selSet.has(r.sku_article))
                              const groupOffset = groups
                                .slice(0, groups.indexOf(group))
                                .reduce((acc, g) => acc + g.rows.length, 0)

                              return (
                                <>
                                  {/* Заголовок раздела */}
                                  <tr key={`group-${group.typeId}`}
                                    className={`border-t-2 ${group.isPet ? 'border-amber-500/40 bg-amber-900/10' : 'border-forest-light/30 bg-forest-light/5'}`}>
                                    <td className="px-6 py-2.5">
                                      <Checkbox
                                        checked={groupAllOn}
                                        indeterminate={!groupAllOn && groupSomeOn}
                                        onChange={() => toggleGroup(l.id, group.rows)}
                                      />
                                    </td>
                                    <td colSpan={6} className="px-2 py-2.5">
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

                                  {/* Строки */}
                                  {group.rows.map((item, idx) => {
                                    const isChecked  = selSet.has(item.sku_article)
                                    const priceNoVat = Number(item.final_price) || 0
                                    const priceVat   = priceNoVat * (1 + VAT)
                                    const globalNum  = groupOffset + idx + 1
                                    return (
                                      <tr
                                        key={item.sku_article}
                                        onClick={() => toggleRow(l.id, item.sku_article)}
                                        className={`border-t border-forest-light/10 cursor-pointer transition-colors
                                          ${isChecked
                                            ? 'bg-gold/10 hover:bg-gold/15'
                                            : idx % 2 !== 0
                                              ? 'bg-forest-light/5 hover:bg-forest-light/10'
                                              : 'hover:bg-forest-light/5'
                                          }`}
                                      >
                                        <td className="px-6 py-2.5" onClick={e => e.stopPropagation()}>
                                          <Checkbox
                                            checked={isChecked}
                                            onChange={() => toggleRow(l.id, item.sku_article)}
                                          />
                                        </td>
                                        <td className="px-2 py-2.5 text-muted font-mono text-xs text-right">{globalNum}</td>
                                        <td className="px-4 py-2.5">
                                          <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap">
                                            {highlight(item.sku_article ?? '—')}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-cream font-body">
                                          {highlight(item.product_name ?? '—')}
                                        </td>
                                        <td className="px-4 py-2.5 text-muted font-mono text-right whitespace-nowrap">
                                          {item.package_size ? `${item.package_size} ${item.package_unit}` : '—'}
                                        </td>
                                        <td className="px-4 py-2.5 text-gold font-mono text-right font-medium">
                                          {fmt(priceNoVat)}
                                        </td>
                                        <td className="px-6 py-2.5 text-gold/70 font-mono text-right">
                                          {fmt(priceVat)}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
