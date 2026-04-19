import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { ArrowLeft, FileSpreadsheet, Check, AlertTriangle, X } from 'lucide-react'

function fmt(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Ожидаемые колонки: артикул, название, цена без НДС, дата
// Авто-детект по заголовку
function detectCols(headers) {
  let article = '', name = '', price = '', date = ''
  headers.forEach(h => {
    const l = h.label.toLowerCase()
    if (!article && (l.includes('артикул') || l.includes('код') || l === 'article')) article = String(h.idx)
    if (!name   && (l.includes('назван') || l.includes('наимен') || l === 'name'))    name    = String(h.idx)
    if (!price  && (l.includes('цена') || l.includes('price') || l.includes('без ндс') || l.includes('стоимость'))) price = String(h.idx)
    if (!date   && (l.includes('дата') || l === 'date'))                              date    = String(h.idx)
  })
  return { article, name, price, date }
}

export default function MaterialsImport() {
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  const [step, setStep]     = useState('upload') // upload | preview | confirm_names | importing | done
  const [rawData, setRawData]   = useState([])
  const [headers, setHeaders]   = useState([])
  const [cols, setCols]         = useState({ article: '', name: '', price: '', date: '' })
  const [preview, setPreview]   = useState([])     // [{article, dbName, xlsName, nameConflict, keepNewName, materialId, oldPrice, newPrice, xlsDate, diff, diffPct, found}]
  const [nameConflicts, setNameConflicts] = useState([]) // only rows with conflict
  const [importing, setImporting] = useState(false)
  const [stats, setStats]   = useState({ found: 0, notFound: 0, renamed: 0, total: 0 })
  const [loading, setLoading] = useState(false)

  // --- Шаг 1: парсинг файла ---
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
        setCols(detectCols(hdrs))
        buildPreview(rows, hdrs, detectCols(hdrs))
      } catch (err) { console.error('Parse error:', err) }
    }
    reader.readAsArrayBuffer(file)
  }

  // --- Шаг 2: строим превью + сверяем с базой ---
  async function buildPreview(rows = rawData, hdrs = headers, c = cols) {
    if (!c.article || !c.price) return
    setLoading(true)

    const artIdx   = parseInt(c.article)
    const nameIdx  = c.name  !== '' ? parseInt(c.name)  : null
    const priceIdx = parseInt(c.price)
    const dateIdx  = c.date  !== '' ? parseInt(c.date)  : null

    const parsed = rows.map(r => {
      const article  = String(r[artIdx]   ?? '').trim()
      const xlsName  = nameIdx  != null ? String(r[nameIdx]  ?? '').trim() : ''
      const rawPrice = String(r[priceIdx] ?? '').replace(',', '.').replace(/\s/g, '')
      const newPrice = parseFloat(rawPrice)
      const rawDate  = dateIdx  != null ? r[dateIdx] : null
      let xlsDate    = new Date().toISOString().slice(0, 10)
      if (rawDate) {
        // Excel может отдать число (serial) или строку
        if (typeof rawDate === 'number') {
          const d = XLSX.SSF.parse_date_code(rawDate)
          xlsDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
        } else {
          const d = new Date(rawDate)
          if (!isNaN(d)) xlsDate = d.toISOString().slice(0, 10)
        }
      }
      return { article, xlsName, newPrice, xlsDate }
    }).filter(r => r.article && !isNaN(r.newPrice) && r.newPrice > 0)

    if (!parsed.length) { setLoading(false); return }

    const articles = [...new Set(parsed.map(r => r.article))]
    const { data: materials } = await supabase
      .from('raw_materials_with_price')
      .select('id, article, name, current_price')
      .in('article', articles)

    const matMap = Object.fromEntries((materials ?? []).map(m => [m.article, m]))

    const result = parsed.map(r => {
      const mat      = matMap[r.article]
      const oldPrice = mat?.current_price != null ? Number(mat.current_price) : null
      const diff     = oldPrice != null ? r.newPrice - oldPrice : null
      const diffPct  = oldPrice != null && oldPrice > 0 ? (r.newPrice - oldPrice) / oldPrice * 100 : null
      const dbName   = mat?.name ?? ''
      const nameConflict = !!mat && r.xlsName && r.xlsName !== dbName

      return {
        article:      r.article,
        dbName,
        xlsName:      r.xlsName,
        nameConflict,
        keepNewName:  false, // default: оставляем старое
        found:        !!mat,
        materialId:   mat?.id,
        oldPrice,
        newPrice:     r.newPrice,
        xlsDate:      r.xlsDate,
        diff,
        diffPct,
      }
    })

    const found     = result.filter(r => r.found).length
    const conflicts = result.filter(r => r.nameConflict)
    setStats({ found, notFound: result.length - found, renamed: 0, total: result.length })
    setPreview(result)
    setNameConflicts(conflicts)
    setLoading(false)

    // Если есть конфликты имён — сначала подтверждение
    setStep(conflicts.length > 0 ? 'confirm_names' : 'preview')
  }

  function resolveConflict(article, keepNew) {
    setPreview(prev => prev.map(r =>
      r.article === article ? { ...r, keepNewName: keepNew } : r
    ))
    setNameConflicts(prev => prev.filter(r => r.article !== article))
  }

  function resolveAll(keepNew) {
    setPreview(prev => prev.map(r => r.nameConflict ? { ...r, keepNewName: keepNew } : r))
    setNameConflicts([])
  }

  // --- Импорт ---
  async function doImport() {
    setImporting(true)
    setStep('importing')

    const toInsert = []
    const renameOps = []

    for (const r of preview) {
      if (!r.found) continue
      toInsert.push({ material_id: r.materialId, price_per_unit: r.newPrice, valid_from: r.xlsDate })
      if (r.nameConflict && r.keepNewName) {
        renameOps.push(supabase.from('raw_materials').update({ name: r.xlsName }).eq('id', r.materialId))
      }
    }

    if (toInsert.length) await supabase.from('material_prices').insert(toInsert)
    if (renameOps.length) await Promise.all(renameOps)

    setStats(s => ({ ...s, renamed: renameOps.length }))
    setImporting(false)
    setStep('done')
  }

  const foundRows    = preview.filter(r => r.found)
  const notFoundRows = preview.filter(r => !r.found)

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/materials')} className="text-muted hover:text-cream transition-colors">
          <ArrowLeft size={18} />
        </button>
      </div>
      <PageHeader title="Импорт цен из Excel" subtitle="Колонки: артикул · название · цена без НДС · дата" />

      {/* ШАГ 1: загрузка */}
      {(step === 'upload' || loading) && (
        <div className="max-w-xl">
          {loading ? (
            <div className="card text-center py-16">
              <p className="text-muted text-sm font-mono animate-pulse">Анализ данных...</p>
            </div>
          ) : (
            <>
              {/* Подсказка по формату */}
              <div className="mb-4 p-4 rounded-lg bg-forest border border-forest-light/40">
                <p className="text-muted text-xs font-body uppercase tracking-widest mb-2">Ожидаемый формат</p>
                <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                  {['Артикул', 'Название', 'Цена без НДС', 'Дата'].map(h => (
                    <span key={h} className="text-gold border border-gold/20 bg-gold/5 px-2 py-1 rounded text-center">{h}</span>
                  ))}
                  {['7330', 'Сенча', '409.84', '07.03.2026'].map((v, i) => (
                    <span key={i} className="text-cream px-2 py-1">{v}</span>
                  ))}
                </div>
                <p className="text-muted/60 text-xs font-body mt-2">Колонка «Дата» необязательна — без неё используется сегодняшняя дата</p>
              </div>

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
            </>
          )}
        </div>
      )}

      {/* ШАГ 2: подтверждение конфликтов имён */}
      {step === 'confirm_names' && (
        <div className="max-w-2xl">
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-cream">Конфликты названий</h3>
                <p className="text-muted text-xs font-body mt-1">
                  Для {nameConflicts.length + preview.filter(r => r.nameConflict && r.keepNewName !== undefined && !nameConflicts.find(c => c.article === r.article)).length} позиций название в файле отличается от базы. Выберите какое оставить.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => resolveAll(false)}
                  className="px-3 py-1.5 text-xs font-body rounded-lg border border-forest-light/40 text-muted hover:text-cream transition-colors">
                  Все — оставить старые
                </button>
                <button onClick={() => resolveAll(true)}
                  className="px-3 py-1.5 text-xs font-body rounded-lg bg-gold/10 border border-gold/20 text-gold hover:bg-gold/20 transition-colors">
                  Все — принять новые
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {preview.filter(r => r.nameConflict).map(r => (
                <div key={r.article} className="border border-forest-light/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">{r.article}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="p-2.5 rounded-lg bg-forest border border-forest-light/30">
                      <div className="text-muted text-xs font-body mb-1">Старое (в базе)</div>
                      <div className="text-cream text-sm font-body">{r.dbName}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-forest border border-gold/20">
                      <div className="text-muted text-xs font-body mb-1">Новое (из файла)</div>
                      <div className="text-gold text-sm font-body">{r.xlsName}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveConflict(r.article, false)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-body border transition-all ${
                        r.keepNewName === false && !nameConflicts.find(c => c.article === r.article)
                          ? 'bg-forest-light/50 border-forest-light text-cream'
                          : 'border-forest-light/40 text-muted hover:text-cream'
                      }`}
                    >
                      Оставить старое
                    </button>
                    <button
                      onClick={() => resolveConflict(r.article, true)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-body border transition-all ${
                        r.keepNewName === true && !nameConflicts.find(c => c.article === r.article)
                          ? 'bg-gold/15 border-gold/30 text-gold'
                          : 'border-forest-light/40 text-muted hover:text-cream'
                      }`}
                    >
                      Принять новое
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-forest-light/30 flex gap-3">
              <button
                onClick={() => setStep('preview')}
                disabled={preview.filter(r => r.nameConflict).some(r => nameConflicts.find(c => c.article === r.article))}
                className="flex-1 py-2 rounded-lg bg-gold/15 text-gold border border-gold/20
                           text-sm font-body hover:bg-gold/25 transition-all disabled:opacity-40"
              >
                Продолжить →
              </button>
              <button onClick={() => setStep('upload')}
                className="px-4 py-2 rounded-lg border border-forest-light/40 text-muted hover:text-cream text-sm font-body">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ШАГ 3: итоговый превью + импорт */}
      {step === 'preview' && (
        <div>
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
            {preview.filter(r => r.nameConflict && r.keepNewName).length > 0 && (
              <div className="card py-3 px-5 text-center">
                <div className="text-2xl font-mono font-semibold text-gold">
                  {preview.filter(r => r.nameConflict && r.keepNewName).length}
                </div>
                <div className="text-muted text-xs font-body">Переименований</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mb-6">
            <button onClick={doImport} disabled={stats.found === 0}
              className="px-8 py-2 rounded-lg bg-gold/15 text-gold border border-gold/20
                         text-sm font-body hover:bg-gold/25 transition-all disabled:opacity-50">
              Импортировать {stats.found} позиций
            </button>
            <button onClick={() => preview.filter(r => r.nameConflict).length > 0 ? setStep('confirm_names') : setStep('upload')}
              className="px-4 py-2 rounded-lg border border-forest-light/40 text-muted hover:text-cream text-sm font-body">
              Назад
            </button>
          </div>

          <div className="card p-0">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-left rounded-tl-[var(--border-radius-lg)]">Артикул</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-left">Название</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Дата</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Старая цена</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Новая цена</th>
                  <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right rounded-tr-[var(--border-radius-lg)]">Разница</th>
                </tr>
              </thead>
              <tbody>
                {[...foundRows, ...notFoundRows].map((r, i) => (
                  <tr key={i} className={!r.found ? 'opacity-40' : ''}>
                    <td className="p-4 border-t border-forest-light/20">
                      <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">{r.article}</span>
                    </td>
                    <td className="p-4 border-t border-forest-light/20 text-xs font-body">
                      {!r.found ? (
                        <span className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle size={12} /> не найден в базе
                        </span>
                      ) : r.nameConflict ? (
                        <span>
                          <span className={r.keepNewName ? 'text-muted line-through' : 'text-cream'}>{r.dbName}</span>
                          {r.keepNewName && <span className="text-gold ml-2">→ {r.xlsName}</span>}
                        </span>
                      ) : (
                        <span className="text-cream">{r.dbName}</span>
                      )}
                    </td>
                    <td className="p-4 border-t border-forest-light/20 text-right font-mono text-xs text-muted">
                      {r.xlsDate ? new Date(r.xlsDate + 'T12:00:00').toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td className="p-4 border-t border-forest-light/20 text-right font-mono text-xs text-muted">{fmt(r.oldPrice)}</td>
                    <td className="p-4 border-t border-forest-light/20 text-right font-mono text-xs text-gold">{fmt(r.newPrice)}</td>
                    <td className="p-4 border-t border-forest-light/20 text-right font-mono text-xs">
                      {r.diff == null ? (
                        <span className="text-muted">новый</span>
                      ) : Math.abs(r.diff) < 0.005 ? (
                        <span className="text-muted">без изменений</span>
                      ) : r.diff > 0 ? (
                        <span className="text-red-400">+{fmt(r.diff)} (+{r.diffPct?.toFixed(1)}%)</span>
                      ) : (
                        <span className="text-emerald-400">{fmt(r.diff)} ({r.diffPct?.toFixed(1)}%)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Импортирую */}
      {step === 'importing' && (
        <div className="card text-center py-16 max-w-md">
          <p className="text-muted text-sm font-mono animate-pulse">Импорт данных...</p>
        </div>
      )}

      {/* ШАГ 4: готово */}
      {step === 'done' && (
        <div className="max-w-md">
          <div className="card text-center py-12">
            <div className="w-14 h-14 rounded-full bg-emerald-400/15 flex items-center justify-center mx-auto mb-4">
              <Check size={26} className="text-emerald-400" />
            </div>
            <h3 className="font-display text-lg font-semibold text-cream mb-2">Импорт завершён</h3>
            <div className="space-y-1 mb-6">
              <p className="text-muted text-sm font-body">
                Обновлено цен: <span className="text-cream font-semibold">{stats.found}</span>
              </p>
              {stats.renamed > 0 && (
                <p className="text-muted text-sm font-body">
                  Переименовано позиций: <span className="text-gold font-semibold">{stats.renamed}</span>
                </p>
              )}
              {stats.notFound > 0 && (
                <p className="text-muted text-sm font-body">
                  Не найдено в базе: <span className="text-amber-400 font-semibold">{stats.notFound}</span>
                </p>
              )}
            </div>
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
