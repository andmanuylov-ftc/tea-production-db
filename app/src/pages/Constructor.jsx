import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import {
  Search, Plus, Trash2, FlaskConical, Package, X,
  Upload, Download, AlertCircle,
} from 'lucide-react'

// item shape:
//   { key, kind: 'material'|'recipe', ref_id, article, name, unit, quantity }

// ---------- Excel helpers ----------

function normalizeUnit(raw) {
  const s = String(raw ?? '').toLowerCase().trim().replace(/\.$/, '')
  if (!s) return ''
  if (['кг', 'kg', 'килограмм', 'килограммы'].includes(s)) return 'кг'
  if (['г', 'гр', 'g', 'gr', 'грамм', 'граммы'].includes(s)) return 'г'
  if (['шт', 'штук', 'штука', 'pcs', 'pc', 'piece'].includes(s)) return 'шт'
  if (['мл', 'ml'].includes(s)) return 'мл'
  return null
}

function findHeaderKey(headers, candidates) {
  for (const h of headers) {
    const norm = String(h ?? '').toLowerCase().trim().replace(/\.$/, '')
    if (candidates.includes(norm)) return h
  }
  return null
}

function mapColumns(headers) {
  return {
    article:  findHeaderKey(headers, ['артикул', 'article', 'код']),
    name:     findHeaderKey(headers, ['название', 'наименование', 'name']),
    quantity: findHeaderKey(headers, ['количество', 'кол-во', 'кол', 'qty', 'quantity']),
    unit:     findHeaderKey(headers, ['ед', 'единица', 'unit']),
  }
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Артикул', 'Название', 'Количество', 'Ед'],
    ['4101', 'Цейлон OP1 (1 сорт)', 0.7, 'кг'],
    ['1001', 'Пример сырья',         0.3, 'кг'],
  ])
  ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 6 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Состав')
  XLSX.writeFile(wb, 'template_constructor.xlsx')
}

// Итого по количеству: г+кг сводится в кг, шт и мл отдельно
function formatQtyTotals(items) {
  let kg = 0, pcs = 0, ml = 0
  for (const i of items ?? []) {
    const q = parseFloat(i.quantity) || 0
    if (i.unit === 'кг')      kg  += q
    else if (i.unit === 'г')  kg  += q / 1000
    else if (i.unit === 'шт') pcs += q
    else if (i.unit === 'мл') ml  += q
  }
  const parts = []
  if (kg  > 0) parts.push(kg.toLocaleString('ru-RU',  { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' кг')
  if (pcs > 0) parts.push(pcs.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' шт')
  if (ml  > 0) parts.push(ml.toLocaleString('ru-RU',  { maximumFractionDigits: 2 }) + ' мл')
  return parts.length === 0 ? '—' : parts.join(' • ')
}

// ---------- Component ----------

export default function Constructor() {
  const navigate = useNavigate()
  const [type, setType]     = useState('recipe') // 'recipe' | 'sku'
  const [name, setName]     = useState('')
  const [items, setItems]   = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // search panel state
  const [panelTab, setPanelTab] = useState('material') // 'material' | 'recipe' (SKU mode)
  const [search, setSearch]     = useState('')
  const [allMats, setAllMats]   = useState([])
  const [allRecs, setAllRecs]   = useState([])

  // import state
  const fileInputRef = useRef(null)
  const [importErrors, setImportErrors]     = useState([])  // critical → blocks import
  const [importWarnings, setImportWarnings] = useState([])  // non-critical
  const [importPending, setImportPending]   = useState(null) // { parsed, fresh, dupes, warnings }

  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    Promise.all([
      supabase.from('raw_materials').select('id, article, name, unit').order('article'),
      supabase.from('recipes').select('id, article, name').order('article'),
    ]).then(([mats, recs]) => {
      if (!mounted.current) return
      setAllMats(mats.data ?? [])
      setAllRecs(recs.data ?? [])
    })
    return () => { mounted.current = false }
  }, [])

  function switchType(t) {
    setType(t)
    setItems([])
    setSearch('')
    setPanelTab(t === 'sku' ? 'recipe' : 'material')
    setError('')
    setImportErrors([])
    setImportWarnings([])
    setImportPending(null)
  }

  const addedKeys = new Set(items.map(i => i.key))

  function addMaterial(mat) {
    const key = `mat_${mat.id}`
    if (addedKeys.has(key)) return
    setItems(prev => [...prev, {
      key, kind: 'material', ref_id: mat.id,
      article: mat.article, name: mat.name,
      unit: mat.unit ?? 'г', quantity: '',
    }])
    setSearch('')
  }

  function addRecipe(rec) {
    const key = `rec_${rec.id}`
    if (addedKeys.has(key)) return
    setItems(prev => [...prev, {
      key, kind: 'recipe', ref_id: rec.id,
      article: rec.article, name: rec.name,
      unit: 'кг', quantity: '',
    }])
    setSearch('')
  }

  function removeItem(key) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  function setQty(key, val) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, quantity: val } : i))
  }

  function setUnit(key, val) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, unit: val } : i))
  }

  // ---------- Import flow ----------

  function openFilePicker() {
    setImportErrors([])
    setImportWarnings([])
    setImportPending(null)
    fileInputRef.current?.click()
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow re-uploading same file later

    try {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) {
        setImportErrors(['В файле нет листов'])
        return
      }
      const ws   = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (rows.length === 0) {
        setImportErrors(['Файл пуст или не содержит данных'])
        return
      }

      const cols = mapColumns(Object.keys(rows[0]))
      if (!cols.article || !cols.quantity) {
        setImportErrors([
          'В шапке файла должны быть столбцы «Артикул» и «Количество». ' +
          'Скачайте шаблон, чтобы увидеть правильный формат.',
        ])
        return
      }

      const errors   = []
      const warnings = []
      const parsed   = []
      const seenInFile = new Set()

      rows.forEach((row, idx) => {
        const lineNum = idx + 2 // +1 за заголовок, +1 для 1-индексации
        const article = String(row[cols.article]  ?? '').trim()
        const qtyRaw  = String(row[cols.quantity] ?? '').trim().replace(',', '.')
        const unitRaw = cols.unit ? String(row[cols.unit] ?? '').trim() : ''

        // полностью пустая строка — молча пропускаем
        if (!article && !qtyRaw && !unitRaw) return

        if (!article) {
          errors.push(`Строка ${lineNum}: пустой артикул`)
          return
        }

        const qty = parseFloat(qtyRaw)
        if (!qtyRaw || isNaN(qty) || qty <= 0) {
          errors.push(`Строка ${lineNum} (${article}): некорректное количество "${qtyRaw}"`)
          return
        }

        // поиск артикула: сначала в рецептах (поддержка sub_recipe), потом в сырье
        const rec = allRecs.find(r => r.article === article)
        const mat = !rec ? allMats.find(m => m.article === article) : null

        if (!rec && !mat) {
          errors.push(`Строка ${lineNum}: артикул "${article}" не найден в базе`)
          return
        }

        const item = rec
          ? { kind: 'recipe',   ref_id: rec.id, article: rec.article, name: rec.name, unit: 'кг' }
          : { kind: 'material', ref_id: mat.id, article: mat.article, name: mat.name, unit: mat.unit ?? 'г' }

        if (unitRaw) {
          const norm = normalizeUnit(unitRaw)
          if (!norm) {
            errors.push(`Строка ${lineNum} (${article}): неизвестная единица "${unitRaw}". Допустимо: г / кг / шт / мл`)
            return
          }
          item.unit = norm
        }

        const key = `${item.kind === 'recipe' ? 'rec' : 'mat'}_${item.ref_id}`
        if (seenInFile.has(key)) {
          warnings.push(`Строка ${lineNum} (${article}): дубликат в файле — пропущен`)
          return
        }
        seenInFile.add(key)

        parsed.push({ ...item, key, quantity: qty })
      })

      // критические ошибки → импорт полностью блокируется
      if (errors.length > 0) {
        setImportErrors(errors)
        setImportWarnings(warnings)
        return
      }

      if (parsed.length === 0) {
        setImportErrors(['Не удалось распознать ни одной позиции'])
        setImportWarnings(warnings)
        return
      }

      // дубликаты с текущими позициями в конструкторе
      const currentKeys = new Set(items.map(i => i.key))
      const dupes = parsed.filter(p =>  currentKeys.has(p.key))
      const fresh = parsed.filter(p => !currentKeys.has(p.key))

      if (items.length > 0) {
        setImportPending({ parsed, fresh, dupes, warnings })
      } else {
        setItems(parsed)
        setImportWarnings(warnings)
      }
    } catch (err) {
      setImportErrors(['Ошибка чтения файла: ' + (err?.message ?? 'неизвестная ошибка')])
    }
  }

  function applyReplace() {
    if (!importPending) return
    setItems(importPending.parsed)
    setImportWarnings(importPending.warnings)
    setImportPending(null)
  }

  function applyAppend() {
    if (!importPending) return
    // пересчитываем дубли на момент применения (на случай ручных добавлений за время показа модалки)
    const currentKeys = new Set(items.map(i => i.key))
    const fresh = importPending.parsed.filter(p => !currentKeys.has(p.key))
    const dupes = importPending.parsed.filter(p =>  currentKeys.has(p.key))
    const extraWarnings = dupes.map(d => `Артикул ${d.article} уже в таблице — пропущен`)
    setItems(prev => [...prev, ...fresh])
    setImportWarnings([...importPending.warnings, ...extraWarnings])
    setImportPending(null)
  }

  function cancelImport() {
    setImportPending(null)
  }

  function dismissNotices() {
    setImportErrors([])
    setImportWarnings([])
  }

  // ---------- Save ----------

  async function handleSave() {
    setError('')
    if (!name.trim())     { setError('Введите название'); return }
    if (items.length === 0) { setError('Добавьте хотя бы одну позицию'); return }

    setSaving(true)
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .insert({ type, name: name.trim() })
      .select('id')
      .single()

    if (projErr || !proj) { setError('Ошибка сохранения'); setSaving(false); return }

    const rows = items.map(i => ({
      project_id:  proj.id,
      material_id: i.kind === 'material' ? i.ref_id : null,
      recipe_id:   i.kind === 'recipe'   ? i.ref_id : null,
      quantity:    parseFloat(String(i.quantity).replace(',', '.')) || 0,
      unit:        i.unit,
    }))

    await supabase.from('project_items').insert(rows)
    setSaving(false)
    navigate('/project')
  }

  // ---------- Search ----------

  const searchResults = (() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    if (panelTab === 'material') {
      return allMats
        .filter(m => !addedKeys.has(`mat_${m.id}`))
        .filter(m => m.article.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    } else {
      return allRecs
        .filter(r => !addedKeys.has(`rec_${r.id}`))
        .filter(r => r.article.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
    }
  })()

  const isSku = type === 'sku'
  const showQtyTotal = type === 'recipe' && items.length > 0

  return (
    <div className="p-8">
      <PageHeader title="Конструктор" subtitle="Создание нового рецепта или SKU" />

      {/* Тип */}
      <div className="flex gap-3 mb-6">
        {[
          { key: 'recipe', icon: FlaskConical, label: 'Рецепт' },
          { key: 'sku',    icon: Package,      label: 'SKU' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => switchType(key)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl border text-sm font-body transition-all ${
              type === key
                ? 'bg-gold/15 text-gold border-gold/30'
                : 'text-muted border-forest-light/40 hover:text-cream hover:border-forest-light'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Название + кнопки импорта */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex-1 min-w-[16rem] max-w-md">
          <label className="text-muted text-xs font-body uppercase tracking-widest block mb-1">Название</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={isSku ? 'Например: Ассам TGFOP-ЗИП100' : 'Например: Ассам TGFOP'}
            className="w-full bg-forest border border-forest-light/40 rounded-lg px-4 py-2.5
                       text-cream text-sm font-body placeholder-muted/60
                       focus:outline-none focus:border-gold/50"
          />
        </div>

        <button
          onClick={openFilePicker}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gold/15 text-gold border border-gold/20
                     text-sm font-body hover:bg-gold/25 transition-all"
        >
          <Upload size={14} />
          Загрузить из Excel
        </button>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-forest border border-forest-light/40
                     text-sm font-body text-muted hover:text-cream hover:border-forest-light transition-all"
        >
          <Download size={14} />
          Шаблон
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {/* Блок ошибок (импорт остановлен) */}
      {importErrors.length > 0 && (
        <div className="card p-4 mb-4 border-red-400/30 bg-red-400/5">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-red-400 text-sm font-body font-semibold mb-2">
                Импорт остановлен. Найдено ошибок: {importErrors.length}
              </h4>
              <ul className="space-y-1 text-red-400/80 text-xs font-body max-h-48 overflow-y-auto">
                {importErrors.map((err, i) => <li key={i}>• {err}</li>)}
              </ul>
              {importWarnings.length > 0 && (
                <>
                  <h5 className="text-yellow-400 text-xs font-body font-semibold mt-3 mb-1">
                    Также предупреждения ({importWarnings.length}):
                  </h5>
                  <ul className="space-y-1 text-yellow-400/80 text-xs font-body max-h-32 overflow-y-auto">
                    {importWarnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </>
              )}
            </div>
            <button onClick={dismissNotices} className="text-muted hover:text-cream">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Блок предупреждений (без ошибок — импорт прошёл) */}
      {importErrors.length === 0 && importWarnings.length > 0 && (
        <div className="card p-4 mb-4 border-yellow-400/30 bg-yellow-400/5">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-yellow-400 text-sm font-body font-semibold mb-2">
                Импорт выполнен с предупреждениями ({importWarnings.length}):
              </h4>
              <ul className="space-y-1 text-yellow-400/80 text-xs font-body max-h-48 overflow-y-auto">
                {importWarnings.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
            <button onClick={dismissNotices} className="text-muted hover:text-cream">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Таблица компонентов */}
        <div className="flex-1">
          <div className="card p-0 overflow-hidden mb-4">
            <table className="w-full">
              <thead className="bg-forest">
                <tr className="text-left">
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
                  {isSku && <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Тип</th>}
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body w-28 text-right">Количество</th>
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body w-20">Ед.</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={isSku ? 6 : 5} className="p-8 text-center text-muted text-sm font-body">
                      {isSku
                        ? <>Сначала добавьте <span className="text-gold">рецепт</span> чая, затем упаковочные <span className="text-gold">материалы</span> — или загрузите состав из Excel</>
                        : <>Найдите сырьё в поиске справа и нажмите <span className="text-gold">+</span> — или загрузите состав из Excel</>
                      }
                    </td>
                  </tr>
                ) : items.map(item => (
                  <tr key={item.key} className="table-row">
                    <td className="p-4">
                      <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">
                        {item.article}
                      </span>
                    </td>
                    <td className="p-4 text-cream text-sm font-body">{item.name}</td>
                    {isSku && (
                      <td className="p-4">
                        <span className={`badge text-xs font-body ${
                          item.kind === 'recipe'
                            ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
                            : 'bg-forest-light/40 text-muted border border-forest-light/40'
                        }`}>
                          {item.kind === 'recipe' ? 'Рецепт' : 'Сырьё'}
                        </span>
                      </td>
                    )}
                    <td className="p-4 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={e => setQty(item.key, e.target.value)}
                        className="w-24 bg-forest border border-forest-light/40 rounded-lg px-2 py-1
                                   text-cream text-sm font-mono text-right
                                   focus:outline-none focus:border-gold/50"
                      />
                    </td>
                    <td className="p-4">
                      <select
                        value={item.unit}
                        onChange={e => setUnit(item.key, e.target.value)}
                        className="bg-forest border border-forest-light/40 rounded-lg px-2 py-1
                                   text-cream text-sm font-mono focus:outline-none focus:border-gold/50
                                   appearance-none cursor-pointer w-16"
                      >
                        <option value="г">г</option>
                        <option value="кг">кг</option>
                        <option value="шт">шт</option>
                        <option value="мл">мл</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <button onClick={() => removeItem(item.key)} className="text-muted hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Итого количество — только для рецепта */}
          {showQtyTotal && (
            <div className="card p-3 mb-4 flex justify-between items-center">
              <span className="text-muted text-xs font-body uppercase tracking-widest">Итого количество</span>
              <span className="text-cream font-mono font-semibold text-sm">{formatQtyTotals(items)}</span>
            </div>
          )}

          {error && <p className="text-red-400 text-sm font-body mb-3">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-2.5 rounded-lg bg-gold/15 text-gold border border-gold/20
                       text-sm font-body hover:bg-gold/25 transition-all disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить в Проект'}
          </button>
        </div>

        {/* Правая панель поиска */}
        <div className="w-80 flex-shrink-0 card">

          {/* Вкладки панели (только в режиме SKU) */}
          {isSku && (
            <div className="flex gap-1 mb-4 bg-forest rounded-lg p-1">
              <button
                onClick={() => { setPanelTab('recipe'); setSearch('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-body transition-all ${
                  panelTab === 'recipe'
                    ? 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/20'
                    : 'text-muted hover:text-cream'
                }`}
              >
                <FlaskConical size={12} /> Рецепты
              </button>
              <button
                onClick={() => { setPanelTab('material'); setSearch('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-body transition-all ${
                  panelTab === 'material'
                    ? 'bg-gold/15 text-gold border border-gold/20'
                    : 'text-muted hover:text-cream'
                }`}
              >
                <Package size={12} /> Сырьё
              </button>
            </div>
          )}

          <h3 className="font-display text-sm font-semibold text-cream mb-3">
            {isSku
              ? (panelTab === 'recipe' ? 'Добавить рецепт чая' : 'Добавить сырьё/упаковку')
              : 'Добавить сырьё'}
          </h3>

          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по артикулу или названию…"
              className="w-full bg-forest border border-forest-light/40 rounded-lg pl-8 pr-3 py-1.5
                         text-cream text-sm font-body placeholder-muted/60
                         focus:outline-none focus:border-gold/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-cream">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="space-y-0.5 max-h-[55vh] overflow-y-auto">
            {!search.trim() ? (
              <p className="text-muted text-xs font-body py-2">Введите артикул или название для поиска</p>
            ) : searchResults.length === 0 ? (
              <p className="text-muted text-xs font-body py-2">Ничего не найдено</p>
            ) : searchResults.map(item => (
              <button
                key={item.id}
                onClick={() => panelTab === 'recipe' ? addRecipe(item) : addMaterial(item)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                           hover:bg-forest-light/40 transition-colors group"
              >
                <div className="text-left min-w-0 flex-1 mr-2">
                  <div className="font-mono text-xs text-gold">{item.article}</div>
                  <div className="text-cream text-xs font-body leading-tight truncate">{item.name}</div>
                </div>
                <Plus size={14} className="text-muted group-hover:text-gold transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Модалка: Заменить / Добавить */}
      {importPending && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <h3 className="font-display text-base text-cream mb-3">Импорт из Excel</h3>
            <div className="text-sm text-cream/80 font-body space-y-2 mb-5">
              <p>
                В таблице конструктора уже <span className="text-gold">{items.length}</span> позиций.
              </p>
              <p>
                В файле распознано <span className="text-gold">{importPending.parsed.length}</span> позиций
                {importPending.dupes.length > 0 && (
                  <>, из них <span className="text-yellow-400">{importPending.dupes.length}</span> уже есть в таблице</>
                )}.
              </p>
              {importPending.dupes.length > 0 && (
                <p className="text-xs text-muted">
                  При выборе «Добавить» дубликаты будут пропущены (добавится {importPending.fresh.length}).
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={cancelImport}
                className="px-4 py-2 rounded-lg bg-forest border border-forest-light/40
                           text-sm font-body text-muted hover:text-cream"
              >
                Отмена
              </button>
              <button
                onClick={applyAppend}
                className="px-4 py-2 rounded-lg bg-emerald-400/15 text-emerald-400 border border-emerald-400/20
                           text-sm font-body hover:bg-emerald-400/25 transition-all"
              >
                Добавить
              </button>
              <button
                onClick={applyReplace}
                className="px-4 py-2 rounded-lg bg-gold/15 text-gold border border-gold/20
                           text-sm font-body hover:bg-gold/25 transition-all"
              >
                Заменить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
