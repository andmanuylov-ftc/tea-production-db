import { useEffect, useRef, useState, useMemo } from 'react'
import ExcelJS from 'exceljs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import {
  Download, FileText, Search, X, FileSpreadsheet,
  ChevronDown, ChevronUp, Image as ImageIcon,
} from 'lucide-react'

// 5 уровней цен — соответствуют колонкам manager_pricelist_v1
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

function normalizeGrams(size, unit) {
  if (size === null || size === undefined) return null
  const n = Number(size)
  if (isNaN(n)) return null
  if (unit === 'кг') return Math.round(n * 1000)
  return Math.round(n)
}

function getPackageFormat(article) {
  if (!article) return 'другое'
  if (article.includes('-ЗИП100')) return 'ЗИП100'
  if (article.includes('-ПА500')) return 'ПА500'
  if (article.includes('-ПР')) return 'Прессованный'
  if (/-10[А-Я]?$/.test(article)) return 'ПЭТ-банка'
  return 'другое'
}

const PACKAGE_OPTIONS = ['ЗИП100', 'ПА500', 'ПЭТ-банка', 'Прессованный', 'другое']

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function PriceListsManager() {
  const { user } = useAuth()

  const [rows, setRows] = useState([])
  const [descriptions, setDescriptions] = useState({})
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [packageFilter, setPackageFilter] = useState('')

  const [exporting, setExporting] = useState(false)

  // История скачиваний
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

  // Скачивание клиентского прайса — все 5 уровней, без модалки
  async function downloadXLSX() {
    if (!user) return
    setExporting(true)
    try {
      // 1. Аудит-лог (tier = 'all', контрагент/примечание пустые)
      const skuCount = filteredRows.length
      const { error: auditError } = await supabase
        .from('pricelist_downloads')
        .insert({
          user_id: user.id,
          tier: 'all',
          client_name: null,
          sku_count: skuCount,
          notes: null,
        })
      if (auditError) throw new Error(`Не удалось записать аудит-лог: ${auditError.message}`)

      // 2. Грузим шаблон
      const res = await fetch('/template_price.xlsx')
      if (!res.ok) throw new Error(`Шаблон недоступен (${res.status})`)
      const buffer = await res.arrayBuffer()

      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const sheet = wb.getWorksheet('Прайс-лист')
      if (!sheet) throw new Error('В шаблоне нет листа «Прайс-лист»')

      const START_ROW = 11
      const END_ROW = 310
      const MAX_ROWS = END_ROW - START_ROW + 1
      const PRICE_COLS = ['I', 'J', 'K', 'L', 'M']

      const fillCount = Math.min(filteredRows.length, MAX_ROWS)
      for (let i = 0; i < fillCount; i++) {
        const sku = filteredRows[i]
        const row = START_ROW + i
        const grams = normalizeGrams(sku.package_size, sku.package_unit)

        sheet.getCell(`A${row}`).value = sku.category_name ?? ''
        sheet.getCell(`B${row}`).value = sku.sku_article ?? ''
        sheet.getCell(`C${row}`).value = sku.sku_name ?? ''
        sheet.getCell(`D${row}`).value = descriptions[sku.product_id] ?? ''
        sheet.getCell(`E${row}`).value = grams ?? 0
        sheet.getCell(`F${row}`).value = 'гр'
        sheet.getCell(`G${row}`).value = 1
        sheet.getCell(`H${row}`).value = 1
        // Вариант 2: пишем все 5 уровней — формулы шаблона ссылаются на I–M
        TIERS.forEach((t, ti) => {
          sheet.getCell(`${PRICE_COLS[ti]}${row}`).value = sku[t.column] ?? 0
        })
        sheet.getCell(`N${row}`).value = 'В наличии'
      }

      const outBuffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([outBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')
      const fileName = `Прайс ПЧК ${today}.xlsx`

      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)

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

      {/* Фильтры */}
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

        <div className="flex-1" />

        <button
          onClick={downloadXLSX}
          disabled={loading || exporting || filteredRows.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40
                     bg-emerald-500/10 text-emerald-300 text-xs font-body font-medium
                     hover:bg-emerald-500/20 hover:border-emerald-500/60 transition-colors whitespace-nowrap
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting ? <Download size={14} className="animate-pulse" /> : <FileSpreadsheet size={14} />}
          {exporting ? 'Готовится…' : 'Скачать клиентский прайс-лист'}
        </button>
      </div>

      {/* Таблица */}
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
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Артикул</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-center px-2 py-3 w-12">Фото</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Наименование</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3">Вес, гр.</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Категория</th>
                  {TIERS.map(t => (
                    <th key={t.key} className="text-gold text-xs uppercase tracking-widest font-body text-right px-4 py-3 whitespace-nowrap">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((item, idx) => (
                  <tr
                    key={item.product_id}
                    className={`border-t border-forest-light/10 ${idx % 2 !== 0 ? 'bg-forest-light/5' : ''} hover:bg-forest-light/10 transition-colors`}
                  >
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
                    <td className="px-4 py-2.5 text-muted text-xs">{item.category_name ?? '—'}</td>
                    {TIERS.map((t, ti) => (
                      <td
                        key={t.key}
                        className={`px-4 py-2.5 font-mono text-right whitespace-nowrap ${ti === 0 ? 'text-gold font-medium' : 'text-gold/70'}`}
                      >
                        {item[t.column]?.toLocaleString('ru-RU') ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* История скачиваний */}
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
    </div>
  )
}
