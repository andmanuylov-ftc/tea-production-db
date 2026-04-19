import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import {
  FlaskConical, Package, ChevronDown, ChevronRight,
  MoreHorizontal, Pencil, Trash2, Check, X
} from 'lucide-react'

const TABS = [
  { key: 'recipe', icon: FlaskConical, label: 'Рецепты' },
  { key: 'sku',    icon: Package,      label: 'SKU' },
]

// Конвертировать количество в базовую единицу (кг или шт)
function toBaseQty(quantity, unit) {
  const q = parseFloat(quantity) || 0
  if (unit === 'г') return q / 1000
  return q // кг, шт, мл — как есть
}

function fmt(val) {
  if (val == null || isNaN(val)) return '—'
  return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Project() {
  const [tab, setTab]           = useState('recipe')
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [openId, setOpenId]     = useState(null)
  const [items, setItems]       = useState({})       // id -> items[]
  const [costs, setCosts]       = useState({})       // id -> { itemId -> cost, total }
  const [itemsLoading, setItemsLoading] = useState({})

  const [menuId, setMenuId]       = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const menuRef = useRef(null)

  const [editProject, setEditProject] = useState(null)
  const [editName, setEditName]       = useState('')
  const [editItems, setEditItems]     = useState([])
  const [saving, setSaving]           = useState(false)

  useEffect(() => { loadProjects() }, [tab])

  useEffect(() => {
    function handle(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuId(null); setConfirmId(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function loadProjects() {
    setLoading(true)
    setOpenId(null); setMenuId(null); setConfirmId(null); setEditProject(null)
    const { data } = await supabase
      .from('projects').select('id, name, type, created_at')
      .eq('type', tab).order('created_at', { ascending: false })
    setProjects(data ?? [])
    setLoading(false)
  }

  async function loadItems(id) {
    if (items[id]) { setOpenId(openId === id ? null : id); return }
    setOpenId(id)
    setItemsLoading(prev => ({ ...prev, [id]: true }))

    const { data: its } = await supabase
      .from('project_items')
      .select('id, quantity, unit, raw_materials(id, article, name, unit), recipes(id, article, name)')
      .eq('project_id', id).order('created_at')

    const rows = its ?? []
    setItems(prev => ({ ...prev, [id]: rows }))

    // --- Загружаем цены ---
    const matIds    = rows.filter(i => i.raw_materials).map(i => i.raw_materials.id)
    const recipeIds = rows.filter(i => i.recipes).map(i => i.recipes.id)

    const [priceRes, recipeRes] = await Promise.all([
      matIds.length
        ? supabase.from('raw_materials_with_price')
            .select('id, current_price, unit')
            .in('id', matIds)
        : { data: [] },
      recipeIds.length
        ? supabase.from('recipe_cost')
            .select('recipe_id, cost_per_kg')
            .in('recipe_id', recipeIds)
        : { data: [] },
    ])

    const priceMap  = Object.fromEntries((priceRes.data ?? []).map(p => [p.id, p]))
    const recipeMap = Object.fromEntries((recipeRes.data ?? []).map(r => [r.recipe_id, r]))

    // --- Считаем стоимость каждой позиции ---
    const costMap = {}
    let total = 0

    for (const item of rows) {
      let itemCost = null

      if (item.raw_materials) {
        const price = priceMap[item.raw_materials.id]
        if (price?.current_price != null) {
          const baseQty = toBaseQty(item.quantity, item.unit)
          itemCost = Number(price.current_price) * baseQty
        }
      } else if (item.recipes) {
        const rc = recipeMap[item.recipes.id]
        if (rc?.cost_per_kg != null) {
          const baseQty = toBaseQty(item.quantity, item.unit)
          itemCost = Number(rc.cost_per_kg) * baseQty
        }
      }

      costMap[item.id] = itemCost
      if (itemCost != null) total += itemCost
    }

    setCosts(prev => ({ ...prev, [id]: { map: costMap, total } }))
    setItemsLoading(prev => ({ ...prev, [id]: false }))
  }

  async function deleteProject(id) {
    await supabase.from('projects').delete().eq('id', id)
    setMenuId(null); setConfirmId(null)
    setProjects(prev => prev.filter(p => p.id !== id))
    if (openId === id) setOpenId(null)
    if (editProject?.id === id) setEditProject(null)
  }

  async function openEdit(p) {
    setMenuId(null); setConfirmId(null)
    setEditProject(p); setEditName(p.name)
    let its = items[p.id]
    if (!its) {
      const { data } = await supabase
        .from('project_items')
        .select('id, quantity, unit, raw_materials(id, article, name), recipes(id, article, name)')
        .eq('project_id', p.id).order('created_at')
      its = data ?? []
      setItems(prev => ({ ...prev, [p.id]: its }))
    }
    setEditItems(its.map(i => ({ ...i, quantity: String(i.quantity) })))
  }

  async function saveEdit() {
    if (!editProject) return
    setSaving(true)
    const ops = []
    if (editName.trim() && editName.trim() !== editProject.name)
      ops.push(supabase.from('projects').update({ name: editName.trim() }).eq('id', editProject.id))
    for (const item of editItems) {
      const qty = parseFloat(String(item.quantity).replace(',', '.')) || 0
      ops.push(supabase.from('project_items').update({ quantity: qty, unit: item.unit }).eq('id', item.id))
    }
    await Promise.all(ops)

    // сбросить кэш позиций чтобы пересчитать стоимость при следующем открытии
    setItems(prev => { const n = { ...prev }; delete n[editProject.id]; return n })
    setCosts(prev => { const n = { ...prev }; delete n[editProject.id]; return n })
    setProjects(prev => prev.map(p =>
      p.id === editProject.id ? { ...p, name: editName.trim() || p.name } : p
    ))
    if (openId === editProject.id) setOpenId(null)
    setSaving(false); setEditProject(null)
  }

  async function removeEditItem(itemId) {
    await supabase.from('project_items').delete().eq('id', itemId)
    setEditItems(prev => prev.filter(i => i.id !== itemId))
    setItems(prev => ({ ...prev, [editProject.id]: (prev[editProject.id] ?? []).filter(i => i.id !== itemId) }))
    setCosts(prev => { const n = { ...prev }; delete n[editProject.id]; return n })
  }

  function setEditQty(itemId, val) { setEditItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: val } : i)) }
  function setEditUnit(itemId, val) { setEditItems(prev => prev.map(i => i.id === itemId ? { ...i, unit: val } : i)) }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="p-8">
      <PageHeader title="Проект" subtitle="Сохранённые конструкции" />

      <div className="flex gap-1 mb-6 bg-forest rounded-lg p-1 w-fit">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-body transition-all ${
              tab === key ? 'bg-gold/15 text-gold border border-gold/20' : 'text-muted hover:text-cream'
            }`}
          ><Icon size={14} />{label}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted text-sm font-mono animate-pulse">Загрузка...</p>
      ) : projects.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-muted text-sm font-body">Нет сохранённых проектов</p>
          <p className="text-muted/50 text-xs font-body mt-1">Создайте в разделе «Конструктор»</p>
        </div>
      ) : (
        <div className="flex gap-6">
          <div className="flex-1 flex flex-col gap-3">
            {projects.map(p => {
              const projCosts = costs[p.id]
              return (
                <div key={p.id} className={`card overflow-hidden transition-all ${editProject?.id === p.id ? 'border-gold/30' : ''}`}>

                  {/* Заголовок */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => openId === p.id ? setOpenId(null) : loadItems(p.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
                    >
                      {openId === p.id
                        ? <ChevronDown size={16} className="text-gold flex-shrink-0" />
                        : <ChevronRight size={16} className="text-muted flex-shrink-0" />}
                      <span className="text-cream font-body font-medium text-sm truncate">{p.name}</span>
                      <span className="text-muted text-xs font-mono flex-shrink-0 ml-2">{fmtDate(p.created_at)}</span>
                    </button>

                    {/* ⋯ меню */}
                    <div className="relative ml-3 flex-shrink-0" ref={menuId === p.id ? menuRef : null}>
                      <button
                        onClick={() => { setMenuId(menuId === p.id ? null : p.id); setConfirmId(null) }}
                        className="p-1.5 rounded-md text-muted hover:text-cream hover:bg-forest-light/50 transition-colors"
                      ><MoreHorizontal size={16} /></button>

                      {menuId === p.id && (
                        <div className="absolute right-0 top-8 z-50 w-40 bg-forest border border-forest-light/50 rounded-lg shadow-lg overflow-hidden">
                          <button onClick={() => openEdit(p)}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-body text-cream hover:bg-forest-light/50 transition-colors text-left">
                            <Pencil size={13} className="text-muted" /> Изменить
                          </button>
                          {confirmId === p.id ? (
                            <div className="px-4 py-2.5 border-t border-forest-light/30">
                              <p className="text-xs text-muted font-body mb-2">Удалить проект?</p>
                              <div className="flex gap-3">
                                <button onClick={() => deleteProject(p.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"><Check size={12} /> Да</button>
                                <button onClick={() => setConfirmId(null)} className="flex items-center gap-1 text-xs text-muted hover:text-cream transition-colors"><X size={12} /> Нет</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmId(p.id)}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-body text-red-400 hover:bg-red-400/10 transition-colors text-left border-t border-forest-light/30">
                              <Trash2 size={13} /> Удалить
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Состав с себестоимостью */}
                  {openId === p.id && (
                    <div className="mt-4 -mx-6">
                      {itemsLoading[p.id] ? (
                        <p className="px-6 text-muted text-xs font-mono animate-pulse">Загрузка...</p>
                      ) : (
                        <>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-t border-forest-light/20">
                                <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-6 py-2">Артикул</th>
                                <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-2">Название</th>
                                <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-2">Тип</th>
                                <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-2">Кол-во</th>
                                <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-6 py-2 text-gold/80">Себест., руб.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(items[p.id] ?? []).map(item => {
                                const isRecipe = !!item.recipes
                                const obj = isRecipe ? item.recipes : item.raw_materials
                                const itemCost = projCosts?.map[item.id]
                                return (
                                  <tr key={item.id} className="border-t border-forest-light/10 hover:bg-forest-light/5">
                                    <td className="px-6 py-2.5">
                                      <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">
                                        {obj?.article ?? '—'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-cream font-body text-xs">{obj?.name ?? '—'}</td>
                                    <td className="px-4 py-2.5">
                                      <span className={`badge text-xs font-body ${isRecipe
                                        ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
                                        : 'bg-forest-light/40 text-muted border border-forest-light/40'}`}>
                                        {isRecipe ? 'Рецепт' : 'Сырьё'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">
                                      {item.quantity} {item.unit}
                                    </td>
                                    <td className="px-6 py-2.5 text-right font-mono text-xs text-gold">
                                      {itemCost != null ? fmt(itemCost) : '—'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>

                          {/* Итого */}
                          {projCosts && (
                            <div className="border-t-2 border-forest-light/30 mx-6 mt-1 pt-3 pb-2 flex justify-between items-center">
                              <span className="text-muted text-xs font-body uppercase tracking-widest">Итого себестоимость</span>
                              <span className="text-gold font-mono font-semibold text-sm">{fmt(projCosts.total)} руб.</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Панель редактирования */}
          {editProject && (
            <div className="w-80 flex-shrink-0 card">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-display text-sm font-semibold text-cream">Изменить проект</h3>
                <button onClick={() => setEditProject(null)} className="text-muted hover:text-cream transition-colors"><X size={16} /></button>
              </div>

              <div className="mb-5">
                <label className="text-muted text-xs font-body block mb-1">Название</label>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2 text-cream text-sm font-body focus:outline-none focus:border-gold/50" />
              </div>

              <div className="mb-5">
                <div className="text-muted text-xs font-body uppercase tracking-widest mb-2">Состав</div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {editItems.length === 0 ? (
                    <p className="text-muted text-xs font-body">Нет позиций</p>
                  ) : editItems.map(item => {
                    const isRecipe = !!item.recipes
                    const obj = isRecipe ? item.recipes : item.raw_materials
                    return (
                      <div key={item.id} className="border border-forest-light/30 rounded-lg p-2.5">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0 flex-1 mr-2">
                            <div className="font-mono text-xs text-gold truncate">{obj?.article}</div>
                            <div className="text-cream text-xs font-body leading-tight truncate">{obj?.name}</div>
                          </div>
                          <button onClick={() => removeEditItem(item.id)} className="text-muted hover:text-red-400 transition-colors flex-shrink-0">
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input type="number" min="0" step="0.01" value={item.quantity}
                            onChange={e => setEditQty(item.id, e.target.value)}
                            className="flex-1 bg-forest border border-forest-light/40 rounded-lg px-2 py-1 text-cream text-xs font-mono focus:outline-none focus:border-gold/50" />
                          <select value={item.unit} onChange={e => setEditUnit(item.id, e.target.value)}
                            className="bg-forest border border-forest-light/40 rounded-lg px-2 py-1 text-cream text-xs font-mono focus:outline-none focus:border-gold/50 appearance-none cursor-pointer w-14">
                            <option value="г">г</option>
                            <option value="кг">кг</option>
                            <option value="шт">шт</option>
                            <option value="мл">мл</option>
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button onClick={saveEdit} disabled={saving}
                className="w-full py-2 rounded-lg bg-gold/15 text-gold border border-gold/20 text-sm font-body hover:bg-gold/25 transition-all disabled:opacity-50">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
