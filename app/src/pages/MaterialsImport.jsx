import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { ArrowLeft, FileSpreadsheet, Check, AlertTriangle, Upload } from 'lucide-react'

function fmt(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function MaterialsImport() {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [step, setStep]         = useState('upload') // upload | map | preview | done
  const [headers, setHeaders]   = useState([])
  const [rawData, setRawData]   = useState([])
  const [articleCol, setArticleCol] = useState('')
  const [priceCol, setPriceCol]     = useState('')
  const [preview, setPreview]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10))
  const [stats, setStats]       = useState({ found: 0, notFound: 0, total: 0 })

  function processFile(file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (data.length < 2) return

        const hdrs = data[0].map((h, i) => ({ idx: i, label: String(h || `Колонка ${i + 1}`) }))
        const rows = data.slice(1).filter(r => r.some(c => c !== '' && c != null))

        setHeaders(hdrs)
        setRawData(rows)

        // Авто-определение колонок по заголовку
        let autoArticle = '', autoPrice = ''
        hdrs.forEach(h => {
          const l = h.label.toLowerCase()
          if (!autoArticle && (l.includes('артикул') || l.includes('код') || l.includes('article')))
            autoArticle = String(h.idx)
          if (!autoPrice && (l.includes('цена') || l.includes('price') || l.includes('стоимость') || l.includes('прайс')))
            autoPrice = String(h.idx)
        })

        setArticleCol(autoArticle)
        setPriceCol(autoPrice)
        setStep('map')
      } catch (err) {
        console.error('Parse error:', err)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function buildPreview() {
    if (!articleCol || !priceCol) return
    setLoading(true)

    const artIdx   = parseInt(articleCol)
    const priceIdx = parseInt(priceCol)

    const rows = rawData
      .map(r => ({
        article:  String(r[artIdx]   ?? '').trim(),
        newPrice: parseFloat(String(r[priceIdx] ?? '').replace(',', '.').replace(/\s/g, ''))
      }))
      .filter(r => r.article && !isNaN(r.newPrice) && r.newPrice > 0)

    if (!rows.length) { setLoading(false); return }

    const articles = [...new Set(rows.map(r => r.article))]

    const { data: materials } = await supabase
      .from('raw_materials_with_price')
      .select('id, article, name, current_price')
      .in('article', articles)

    const matMap = Object.fromEntries((materials ?? []).map(m => [m.article, m]))

    const result = rows.map(r => {
      const mat      = matMap[r.article]
      const oldPrice = mat?.current_price != null ? Number(mat.current_price) : null
      const diff     = oldPrice != null ? r.newPrice - oldPrice : null
      const diffPct  = oldPrice != null && oldPrice > 0 ? (r.newPrice - oldPrice) / oldPrice * 100 : null
      return {
        article:    r.article,
        name:       mat?.name ?? '— не найден —',
        found:      !!mat,
        materialId: mat?.id,
        oldPrice,
        newPrice:   r.newPrice,
        diff,
        diffPct
      }
    })

    const found = result.filter(r => r.found).length
    setStats({ found, notFound: result.length - found, total: result.length })
    setPreview(result)
    setLoading(false)
    setStep('preview')
  }

  async function doImport() {
    setImporting(true)
    const toInsert = preview
      .filter(r => r.found)
      .map(r => ({
        material_id:    r.materialId,
        price_per_unit: r.newPrice,
        valid_from:     importDate
      }))
    if (toInsert.length) await supabase.from('material_prices').insert(toInsert)
    setImporting(false)
    setStep('done')
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/materials')} className="text-muted hover:text-cream transition-colors">
          <ArrowLeft size={18} />
        </button>
      </div>
      <PageHeader title="Импорт цен из Excel" subtitle="Загрузите файл и обновите цены на сырьё" />

      {/* ШАГ 1: загрузка файла */}
      {step === 'upload' && (
        <div className="max-w-xl">
          <div
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-forest-light/50 rounded-xl p-16
                       flex flex-col items-center justify-center gap-4 cursor-pointer
                       hover:border-gold/40 hover:bg-gold/5 transition-all"
          >
            <FileSpreadsheet size={44} className="text-muted" />
            <div className="text-center">
              <p className="text-cream font-body text-sm">Перетащите файл Excel или нажмите для выбора</p>
              <p className="text-muted text-xs font-body mt-1">.xlsx, .xls</p>
            </div>
            <span className="px-6 py-2 rounded-lg bg-gold/15 text-gold border border-gold/20 text-sm font-body">
              Выбрать файл
            </span>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} />
        </div>
      )}

      {/* ШАГ 2: выбор колонок */}
      {step === 'map' && (
        <div className="max-w-lg">
          <div className="card">
            <h3 className="font-display text-sm font-semibold text-cream mb-1">Укажите колонки</h3>
            <p className="text-muted text-xs font-body mb-5">Найдено {rawData.length} строк данных</p>

            <div className="space-y-4 mb-5">
              <div>
                <label className="text-muted text-xs font-body block mb-1">Колонка с артикулом</label>
                <select value={articleCol} onChange={e => setArticleCol(e.target.value)}
                  className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-body focus:outline-none focus:border-gold/50 appearance-none">
                  <option value="">— выберите —</option>
                  {headers.map(h => <option key={h.idx} value={String(h.idx)}>{h.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-muted text-xs font-body block mb-1">Колонка с ценой (руб/кг)</label>
                <select value={priceCol} onChange={e => setPriceCol(e.target.value)}
                  className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-body focus:outline-none focus:border-gold/50 appearance-none">
                  <option value="">— выберите —</option>
                  {headers.map(h => <option key={h.idx} value={String(h.idx)}>{h.label}</option>)}
                </select>
              </div>
            </div>

            {/* Превью первых строк */}
            {articleCol && priceCol && (
              <div className="mb-5 p-3 bg-forest rounded-lg">
                <p className="text-muted text-xs font-body mb-2 uppercase tracking-widest">Пример строк</p>
                <div className="space-y-1">
                  {rawData.slice(0, 4).map((r, i) => (
                    <div key={i} className="flex gap-6 text-xs font-mono">
                      <span className="text-gold w-28 truncate">{String(r[parseInt(articleCol)] ?? '')}</span>
                      <span className="text-cream">{String(r[parseInt(priceCol)] ?? '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={buildPreview} disabled={!articleCol || !priceCol || loading}
                className="flex-1 py-2 rounded-lg bg-gold/15 text-gold border border-gold/20
                           text-sm font-body hover:bg-gold/25 transition-all disabled:opacity-50">
                {loading ? 'Загрузка...' : 'Проверить данные →'}
              </button>
              <button onClick={() => setStep('upload')}
                className="px-4 py-2 rounded-lg border border-forest-light/40 text-muted hover:text-cream text-sm font-body">
                Назад
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ШАГ 3: превью и импорт */}
      {step === 'preview' && (
        <div>
          {/* Статистика */}
          <div className="flex gap-4 mb-6">
            <div className="card py-3 px-5 text-center">
              <div className="text-2xl font-mono font-semibold text-cream">{stats.total}</div>
              <div className="text-muted text-xs font-body">Всего строк</div>
            </div>
            <div className="card py-3 px-5 text-center">
              <div className="text-2xl font-mono font-semibold text-emerald-400">{stats.found}</div>
              <div className="text-muted text-xs font-body">Найдено в базе</div>
            </div>
            {stats.notFound > 0 && (
              <div className="card py-3 px-5 text-center">
                <div className="text-2xl font-mono font-semibold text-amber-400">{stats.notFound}</div>
                <div className="text-muted text-xs font-body">Не найдено</div>
              </div>
            )}
          </div>

          {/* Дата и кнопка импорта */}
          <div className="flex items-end gap-4 mb-6">
            <div>
              <label className="text-muted text-xs font-body block mb-1">Дата загрузки цен</label>
              <input type="date" value={importDate} onChange={e => setImportDate(e.target.value)}
                className="bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                           text-cream text-sm font-mono focus:outline-none focus:border-gold/50" />
            </div>
            <button onClick={doImport} disabled={importing || stats.found === 0}
              className="px-8 py-2 rounded-lg bg-gold/15 text-gold border border-gold/20
                         text-sm font-body hover:bg-gold/25 transition-all disabled:opacity-50">
              {importing ? 'Импорт...' : `Импортировать ${stats.found} цен`}
            </button>
            <button onClick={() => setStep('map')}
              className="px-4 py-2 rounded-lg border border-forest-light/40 text-muted hover:text-cream text-sm font-body">
              Назад
            </button>
          </div>

          {/* Таблица сравнения */}
          <div className="card p-0">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-left rounded-tl-[var(--border-radius-lg)]">Артикул</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-left">Название</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Старая цена</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Новая цена</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right rounded-tr-[var(--border-radius-lg)]">Разница</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className={!r.found ? 'opacity-40' : ''}>
                    <td className="p-4 border-t border-forest-light/20">
                      <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">{r.article}</span>
                    </td>
                    <td className="p-4 border-t border-forest-light/20 text-cream font-body text-xs">
                      {r.found ? r.name : (
                        <span className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle size={12} /> не найден в базе
                        </span>
                      )}
                    </td>
                    <td className="p-4 border-t border-forest-light/20 text-right font-mono text-xs text-muted">
                      {fmt(r.oldPrice)}
                    </td>
                    <td className="p-4 border-t border-forest-light/20 text-right font-mono text-xs text-gold">
                      {fmt(r.newPrice)}
                    </td>
                    <td className="p-4 border-t border-forest-light/20 text-right font-mono text-xs">
                      {r.diff == null ? (
                        <span className="text-muted">новый</span>
                      ) : r.diff > 0.005 ? (
                        <span className="text-red-400">
                          +{fmt(r.diff)}{r.diffPct != null ? ` (+${r.diffPct.toFixed(1)}%)` : ''}
                        </span>
                      ) : r.diff < -0.005 ? (
                        <span className="text-emerald-400">
                          {fmt(r.diff)}{r.diffPct != null ? ` (${r.diffPct.toFixed(1)}%)` : ''}
                        </span>
                      ) : (
                        <span className="text-muted">без изменений</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ШАГ 4: завершено */}
      {step === 'done' && (
        <div className="max-w-md">
          <div className="card text-center py-12">
            <div className="w-14 h-14 rounded-full bg-emerald-400/15 flex items-center justify-center mx-auto mb-4">
              <Check size={26} className="text-emerald-400" />
            </div>
            <h3 className="font-display text-lg font-semibold text-cream mb-2">Импорт завершён</h3>
            <p className="text-muted text-sm font-body mb-6">
              Обновлено <span className="text-cream font-semibold">{stats.found}</span> цен на дату{' '}
              <span className="text-cream font-mono">{new Date(importDate + 'T12:00:00').toLocaleDateString('ru-RU')}</span>
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/materials')}
                className="px-6 py-2 rounded-lg bg-gold/15 text-gold border border-gold/20 text-sm font-body hover:bg-gold/25 transition-all">
                К сырью и материалам
              </button>
              <button onClick={() => { setStep('upload'); setPreview([]); setRawData([]); setHeaders([]) }}
                className="px-6 py-2 rounded-lg border border-forest-light/40 text-muted hover:text-cream text-sm font-body">
                Загрузить ещё
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
