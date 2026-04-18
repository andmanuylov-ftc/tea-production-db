import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search, Plus, Trash2, FlaskConical, Package, X } from 'lucide-react'

// item shape:
//   { key, kind: 'material'|'recipe', ref_id, article, name, unit, quantity }

export default function Constructor() {
  const navigate = useNavigate()
  const [type, setType]       = useState('recipe')   // 'recipe' | 'sku'
  const [name, setName]       = useState('')
  const [items, setItems]     = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // search panel state
  const [panelTab, setPanelTab] = useState('material') // 'material' | 'recipe' (SKU mode only)
  const [search, setSearch]     = useState('')
  const [allMats, setAllMats]   = useState([])
  const [allRecs, setAllRecs]   = useState([])
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

  // When switching type reset items and panel
  function switchType(t) {
    setType(t)
    setItems([])
    setSearch('')
    setPanelTab(t === 'sku' ? 'recipe' : 'material')
    setError('')
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

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('Введите название'); return }
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

  // Search results for current panel tab
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

      {/* Название */}
      <div className="mb-6 max-w-md">
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
                        ? <>Сначала добавьте <span className="text-gold">рецепт</span> чая, затем упаковочные <span className="text-gold">материалы</span></>
                        : <>Найдите сырьё в поиске справа и нажмите <span className="text-gold">+</span></>
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
    </div>
  )
}
