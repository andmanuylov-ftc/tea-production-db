import { useEffect, useRef, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { fetchPriceListRows, downloadClientPriceList } from '../lib/clientPriceList'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import {
  Download, FileText, Search, X, FileSpreadsheet,
  ChevronDown, ChevronUp, Image as ImageIcon,
} from 'lucide-react'

// 5 уровней цен — соответствуют колонкам manager_pricelist_v1 (цены без НДС)
const TIERS = [
  { key: 'base',        label: 'Базовый',          column: 'price_base' },
  { key: 'opt',         label: 'Опт',              column: 'price_opt' },
  { key: 'opt_plus',    label: 'Опт+',             column: 'price_opt_plus' },
  { key: 'partner',     label: 'Партнер',          column: 'price_partner' },
  { key: 'key_partner', label: 'Ключевой партнер', column: 'price_key_partner' },
]

function formatWeight(size, unit) {
  if (!size) return '—'
  const n = Number(size)
  if (unit === 'кг') return Math.round(n * 1000)
  if (unit === 'г')  return Math.round(n)
  return `${size} ${unit}`
}

// Расшифровка артикулов:
//   П = пакет, Р = ручная фасовка, А = автоматическая, число = граммы
//   суффиксы -10 / -10Б — ПЭТ-банки
//   без суффикса (7049И, 7068-СМ-500, 7221, 7236) — прессованный чай
function getPackageFormat(article) {
  if (!article) return 'Прессованный'
  if (article.includes('-ПА100'))  return 'ПА100'
  if (article.includes('-ПР100'))  return 'ПР100'
  if (article.includes('-ПА500'))  return 'ПА500'
  if (article.includes('-ПР250'))  return 'ПР250'
  if (article.includes('-ПР500'))  return 'ПР500'
  if (article.includes('-ПА250'))  return 'ПА250'
  if (article.includes('-ЗИП100')) return 'ЗИП100'
  if (/-10[А-Я]?$/.test(article))  return 'ПЭТ'
  return 'Прессованный'
}

const PACKAGE_OPTIONS = ['ПА100', 'ПА500', 'ПЭТ', 'ПР250', 'ЗИП100', 'ПР500', 'Прессованный', 'ПА250']

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// Компонент чекбокса с поддержкой indeterminate (как у админа)
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

export default function PriceListsManager() {
  const { user } = useAuth()

  const [rows, setRows] = useState([])
  const [descriptions, setDescriptions] = useState({})
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [packageFilter, setPackageFilter] = useState('')

  const [selected, setSelected] = useState(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportingFlat, setExportingFlat] = useState(false)
  const [showClientVatModal, setShowClientVatModal] = useState(false)

  const [history, setHistory] = useState([])
  const [historyExpanded, setHistoryExpanded] = useState(false)

  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    loadData()
    loadHistory()
    return () => { mounted.current = false }
  }, [])

  async function loadData() {
    setLoading(true)
    const [pricesRes, descRes] = await Promise.all([
      supabase
        .from('manager_pricelist_v1')
        .select('*')
        .order('sku_article'),
      supabase
        .from('product_descriptions')
        .select('product_id, description')
        .not('description', 'is', null),
    ])
    if (!mounted.current) return

    const descMap = {}
    ;(descRes.data ?? []).forEach(d => { descMap[d.product_id] = d.description })
    setDescriptions(descMap)
    setRows(pricesRes.data ?? [])
    setLoading(false)
  }

  async function loadHistory() {
    if (!user) return
    const { data } = await supabase
      .from('pricelist_downloads')
      .select('id, downloaded_at, tier, client_name, sku_count, notes')
      .eq('user_id', user.id)
      .order('downloaded_at', { ascending: false })
      .limit(10)
    if (!mounted.current) return
    setHistory(data ?? [])
  }

  const categories = useMemo(() => {
    const set = new Set()
    rows.forEach(r => { if (r.category_name) set.add(r.category_name) })
    return Array.from(set).sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchA = (r.sku_article ?? '').toLowerCase().includes(q)
        const matchN = (r.sku_name ?? '').toLowerCase().includes(q)
        if (!matchA && !matchN) return false
      }
      if (categoryFilter && r.category_name !== categoryFilter) return false
      if (packageFilter && getPackageFormat(r.sku_article) !== packageFilter) return false
      return true
    })
  }, [rows, search, categoryFilter, packageFilter])

  // Группировка по категории — для экрана и выгрузок
  function groupByCategory(rs) {
    const map = new Map()
    for (const r of rs) {
      const key = r.category_name ?? 'Без категории'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return Array.from(map.entries())
      .map(([name, items]) => ({ name, rows: items }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  const groups = useMemo(() => groupByCategory(filteredRows), [filteredRows])

  // Сводные флаги выделения
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

  // Общая выборка для выгрузок: выбранные (если есть) или все отфильтрованные
  function getExportRows() {
    if (selCount > 0) return filteredRows.filter(r => selected.has(r.sku_article))
    return filteredRows
  }

  // ---- Плоский внутренний прайс (без НДС, группировка по категориям) ----
  async function exportFlatPriceList() {
    if (!user) return
    setExportingFlat(true)
    try {
      const exportRows = getExportRows()
      const exportGroups = groupByCategory(exportRows)
      const today = new Date().toLocaleDateString('ru-RU')

      const sheetData = [
        ['Прайс-лист ПЧК/ADDIS'],
        [`Дата выгрузки: ${today}`],
        ['Цены без НДС, по уровням клиентов'],
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
            item.sku_name ?? '—',
            formatWeight(item.package_size, item.package_unit),
            ...TIERS.map(t => item[t.column] ?? 0),
            descriptions[item.product_id] ?? '',
          ])
        })
        if (gi < exportGroups.length - 1) sheetData.push([])
      })

      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      ws['!cols'] = [
        { wch: 4 }, { wch: 14 }, { wch: 32 }, { wch: 8 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
        { wch: 28 },
      ]
      ws['!pageSetup'] = {
        paperSize: 9, orientation: 'landscape',
        fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      }
      ws['!margins'] = {
        left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2,
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист')
      const suffix = selCount > 0 ? ` (${exportRows.length} поз)` : ''
      const fileName = `Прайс-лист ПЧК${suffix} ${today.replace(/\./g, '-')}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (err) {
      console.error('Ошибка выгрузки:', err)
      alert(`Не удалось сформировать прайс: ${err.message}`)
    } finally {
      setExportingFlat(false)
    }
  }

  // ---- Клиентский прайс (бланк заказов) — сборка книги из pricelist_export_v1 ----
  async function exportClientPriceList(withVat = true) {
    if (!user) return
    setExporting(true)
    try {
      const exportRows = getExportRows()
      const articles = exportRows.map(r => r.sku_article)
      const rowsForFile = await fetchPriceListRows(supabase, articles)

      if (rowsForFile.length === 0) {
        throw new Error('Ни одна из выбранных позиций не размечена для клиентского прайса.')
      }

      const { error: auditError } = await supabase
        .from('pricelist_downloads')
        .insert({
          user_id: user.id,
          tier: 'all',
          client_name: null,
          sku_count: rowsForFile.length,
          notes: withVat ? 'клиентский прайс, с НДС' : 'клиентский прайс, без НДС',
        })
      if (auditError) throw new Error(`Не удалось записать аудит-лог: ${auditError.message}`)

      await downloadClientPriceList(rowsForFile, {
        withVat,
        dateStr: new Date().toLocaleDateString('ru-RU'),
        managerName: '',
      })

      await loadHistory()
    } catch (err) {
      console.error('Ошибка выгрузки:', err)
      alert(`Не удалось сформировать прайс: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="ПРАЙС ЛИСТ"
        subtitle="Цены без НДС, по уровням клиентов"
        action={
          <div className="flex items-center gap-2 text-muted text-xs font-body">
            <FileText size={14} />
            <span className="text-cream">{filteredRows.length}</span>
            {filteredRows.length !== rows.length && (
              <span className="text-muted"> / {rows.length}</span>
            )}
            <span>позиций</span>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[16rem] max-w-sm">
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

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                     text-cream text-sm font-body focus:outline-none focus:border-gold/50"
        >
          <option value="">Все категории</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={packageFilter}
          onChange={e => setPackageFilter(e.target.value)}
          className="bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                     text-cream text-sm font-body focus:outline-none focus:border-gold/50"
        >
          <option value="">Все фасовки</option>
          {PACKAGE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {selCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gold text-xs font-mono">{selCount} выбрано</span>
            <button onClick={() => setSelected(new Set())}
              className="text-muted hover:text-cream transition-colors" title="Снять выделение">
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={exportFlatPriceList}
          disabled={loading || exportingFlat || filteredRows.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/30
                     bg-gold/10 text-gold text-xs font-body font-medium
                     hover:bg-gold/20 hover:border-gold/50 transition-colors whitespace-nowrap
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title="Плоский прайс с 5 уровнями цен, без НДС, с группировкой по категориям"
        >
          {exportingFlat ? <Download size={14} className="animate-pulse" /> : <Download size={14} />}
          {exportingFlat
            ? 'Готовится…'
            : selCount > 0
              ? `Прайс-лист (${selCount})`
              : 'Скачать прайс-лист'}
        </button>

        <button
          onClick={() => setShowClientVatModal(true)}
          disabled={loading || exporting || filteredRows.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40
                     bg-emerald-500/10 text-emerald-300 text-xs font-body font-medium
                     hover:bg-emerald-500/20 hover:border-emerald-500/60 transition-colors whitespace-nowrap
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title="B2B клиентский прайс: разделы, 5 уровней цен, автосборка бланка заказа"
        >
          {exporting ? <Download size={14} className="animate-pulse" /> : <FileSpreadsheet size={14} />}
          {exporting
            ? 'Готовится…'
            : selCount > 0
              ? `Клиентский (${selCount})`
              : 'Клиентский прайс-лист'}
        </button>
      </div>

      {loading ? (
        <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
      ) : filteredRows.length === 0 ? (
        <div className="card text-center py-12 text-muted text-sm font-body">
          {search || categoryFilter || packageFilter ? 'Ничего не найдено по фильтрам' : 'Нет данных'}
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
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-center px-2 py-3 w-12">Фото</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Наименование</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3">Вес, гр.</th>
                  {TIERS.map(t => (
                    <th key={t.key} className="text-gold text-xs uppercase tracking-widest font-body text-right px-4 py-3 whitespace-nowrap">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group, gi) => {
                  const groupAllOn  = group.rows.every(r => selected.has(r.sku_article))
                  const groupSomeOn = group.rows.some(r => selected.has(r.sku_article))
                  const groupOffset = groups.slice(0, gi).reduce((acc, g) => acc + g.rows.length, 0)

                  return (
                    <>
                      <tr key={`group-${group.name}`} className="border-t-2 border-forest-light/30 bg-forest-light/5">
                        <td className="px-4 py-2.5">
                          <Checkbox
                            checked={groupAllOn}
                            indeterminate={!groupAllOn && groupSomeOn}
                            onChange={() => toggleGroup(group.rows)}
                          />
                        </td>
                        <td colSpan={5 + TIERS.length} className="px-2 py-2.5">
                          <div className="flex items-center gap-2 text-gold">
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

                        return (
                          <tr
                            key={item.product_id}
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
                            <td className="px-2 py-2.5">
                              {item.photo_url ? (
                                <img
                                  src={item.photo_url}
                                  alt=""
                                  className="w-8 h-8 rounded object-cover bg-forest-light/20"
                                  onError={e => { e.currentTarget.style.display = 'none' }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded bg-forest-light/20 flex items-center justify-center mx-auto">
                                  <ImageIcon size={12} className="text-muted/50" />
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-cream font-body">
                              {highlight(item.sku_name ?? '—')}
                            </td>
                            <td className="px-4 py-2.5 text-muted font-mono text-right whitespace-nowrap">
                              {formatWeight(item.package_size, item.package_unit)}
                            </td>
                            {TIERS.map((t, ti) => (
                              <td
                                key={t.key}
                                className={`px-4 py-2.5 font-mono text-right whitespace-nowrap ${ti === 0 ? 'text-gold font-medium' : 'text-gold/70'}`}
                              >
                                {item[t.column]?.toLocaleString('ru-RU') ?? '—'}
                              </td>
                            ))}
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

      {history.length > 0 && (
        <div className="mt-6 card p-0 overflow-hidden">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-forest-light/5 transition-colors"
          >
            {historyExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
            <span className="text-sm font-body text-cream">История моих скачиваний</span>
            <span className="text-muted text-xs font-mono">({history.length})</span>
          </button>
          {historyExpanded && (
            <div className="border-t border-forest-light/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-forest-light/10 bg-forest-light/5">
                    <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-2">Дата</th>
                    <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-2">Кол-во позиций</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-t border-forest-light/10">
                      <td className="px-4 py-2 text-muted text-xs font-mono whitespace-nowrap">{formatDateTime(h.downloaded_at)}</td>
                      <td className="px-4 py-2 text-muted text-xs text-right whitespace-nowrap">{h.sku_count ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
