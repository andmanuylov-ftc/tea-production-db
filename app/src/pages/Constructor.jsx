import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search, Plus, Trash2, FlaskConical, Package, X } from 'lucide-react'

export default function Constructor() {
  const navigate = useNavigate()
  const [type, setType]           = useState('recipe')  // 'recipe' | 'sku'
  const [name, setName]           = useState('')
  const [items, setItems]         = useState([])         // {material_id, article, name, unit, quantity}
  const [allMats, setAllMats]     = useState([])
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    supabase
      .from('raw_materials')
      .select('id, article, name, unit')
      .order('article')
      .then(({ data }) => { if (mounted.current) setAllMats(data ?? []) })
    return () => { mounted.current = false }
  }, [])

  function addMaterial(mat) {
    if (items.find(i => i.material_id === mat.id)) return
    setItems(prev => [...prev, {
      material_id: mat.id,
      article:     mat.article,
      name:        mat.name,
      unit:        mat.unit ?? 'г',
      quantity:    '',
    }])
    setSearch('')
  }

  function removeItem(material_id) {
    setItems(prev => prev.filter(i => i.material_id !== material_id))
  }

  function setQty(material_id, val) {
    setItems(prev => prev.map(i =>
      i.material_id === material_id ? { ...i, quantity: val } : i
    ))
  }

  function setUnit(material_id, val) {
    setItems(prev => prev.map(i =>
      i.material_id === material_id ? { ...i, unit: val } : i
    ))
  }

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('Введите название'); return }
    if (items.length === 0) { setError('Добавьте хотя бы одно сырьё'); return }

    setSaving(true)
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .insert({ type, name: name.trim() })
      .select('id')
      .single()

    if (projErr || !proj) { setError('Ошибка сохранения'); setSaving(false); return }

    const rows = items.map(i => ({
      project_id:  proj.id,
      material_id: i.material_id,
      quantity:    parseFloat(String(i.quantity).replace(',', '.')) || 0,
      unit:        i.unit,
    }))

    await supabase.from('project_items').insert(rows)
    setSaving(false)
    navigate('/project')
  }

  const addedIds = new Set(items.map(i => i.material_id))
  const searchResults = allMats.filter(m => {
    if (addedIds.has(m.id)) return false
    const q = search.toLowerCase()
    return m.article.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
  })

  return (
    <div className="p-8">
      <PageHeader title="Конструктор" subtitle="Создание нового рецепта или SKU" />

      {/* Выбор типа */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setType('recipe')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl border text-sm font-body transition-all ${
            type === 'recipe'
              ? 'bg-gold/15 text-gold border-gold/30'
              : 'text-muted border-forest-light/40 hover:text-cream hover:border-forest-light'
          }`}
        >
          <FlaskConical size={16} />
          Рецепт
        </button>
        <button
          onClick={() => setType('sku')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl border text-sm font-body transition-all ${
            type === 'sku'
              ? 'bg-gold/15 text-gold border-gold/30'
              : 'text-muted border-forest-light/40 hover:text-cream hover:border-forest-light'
          }`}
        >
          <Package size={16} />
          SKU
        </button>
      </div>

      {/* Название */}
      <div className="mb-6 max-w-md">
        <label className="text-muted text-xs font-body uppercase tracking-widest block mb-1">Название</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={type === 'recipe' ? 'Например: Ассам TGFOP' : 'Например: Ассам TGFOP-ЗИП100'}
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
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body w-28 text-right">Количество</th>
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body w-20">Ед.</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted text-sm font-body">
                      Найдите сырьё в поиске справа и нажмите <span className="text-gold">+</span>
                    </td>
                  </tr>
                ) : items.map(item => (
                  <tr key={item.material_id} className="table-row">
                    <td className="p-4">
                      <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">
                        {item.article}
                      </span>
                    </td>
                    <td className="p-4 text-cream text-sm font-body">{item.name}</td>
                    <td className="p-4 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={e => setQty(item.material_id, e.target.value)}
                        className="w-24 bg-forest border border-forest-light/40 rounded-lg px-2 py-1
                                   text-cream text-sm font-mono text-right
                                   focus:outline-none focus:border-gold/50"
                      />
                    </td>
                    <td className="p-4">
                      <select
                        value={item.unit}
                        onChange={e => setUnit(item.material_id, e.target.value)}
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
                      <button
                        onClick={() => removeItem(item.material_id)}
                        className="text-muted hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ошибка и сохранение */}
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

        {/* Поиск сырья */}
        <div className="w-80 flex-shrink-0 card">
          <h3 className="font-display text-sm font-semibold text-cream mb-3">Добавить сырьё</h3>
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

          <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
            {!search.trim() ? (
              <p className="text-muted text-xs font-body py-2">Введите артикул или название для поиска</p>
            ) : searchResults.length === 0 ? (
              <p className="text-muted text-xs font-body py-2">Ничего не найдено</p>
            ) : searchResults.map(mat => (
              <button
                key={mat.id}
                onClick={() => addMaterial(mat)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                           hover:bg-forest-light/40 transition-colors group"
              >
                <div className="text-left min-w-0 flex-1 mr-2">
                  <div className="font-mono text-xs text-gold">{mat.article}</div>
                  <div className="text-cream text-xs font-body leading-tight truncate">{mat.name}</div>
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
