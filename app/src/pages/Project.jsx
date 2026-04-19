import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import {
  FlaskConical, Package, ChevronDown, ChevronRight,
  MoreHorizontal, Pencil, Trash2, Check, X, PlusCircle, Link
} from 'lucide-react'

const TABS = [
  { key: 'recipe', icon: FlaskConical, label: 'Рецепты' },
  { key: 'sku',    icon: Package,      label: 'SKU' },
]

function toKg(quantity, unit) {
  const q = parseFloat(quantity) || 0
  return unit === 'г' ? q / 1000 : q
}

function fmt(val) {
  if (val == null || isNaN(val)) return '—'
  return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const emptyPromote = { article: '', name: '', packageSize: '', saving: false, error: '', done: false }

export default function Project() {
  const [tab, setTab]       = useState('recipe')
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [openId, setOpenId]     = useState(null)
  const [items, setItems]       = useState({})
  const [costs, setCosts]       = useState({})
  const [itemsLoading, setItemsLoading] = useState({})

  const [menuId, setMenuId]       = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const menuRef = useRef(null)

  const [editProject, setEditProject] = useState(null)
  const [editName, setEditName]       = useState('')
  const [editItems, setEditItems]     = useState([])
  const [saving, setSaving]           = useState(false)
  const [promote, setPromote]         = useState({})

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
    setOpenId(null); setMenuId(null); setConfirmId(null); setEditProject(null); setPromote({})
    const { data } = await supabase
      .from('projects')
      .select('id, name, type, created_at, linked_id, linked_article, linked_name')
      .eq('type', tab).order('created_at', { ascending: false })
    setProjects(data ?? [])
    setLoading(false)
  }

  // Загружает позиции и цены, НЕ переключает аккордеон
  async function fetchItems(id) {
    setItemsLoading(prev => ({ ...prev, [id]: true }))

    const { data: its } = await supabase
      .from('project_items')
      .select('id, quantity, unit, raw_materials(id, article, name, unit), recipes(id, article, name)')
      .eq('project_id', id).order('created_at')

    const rows = its ?? []
    setItems(prev => ({ ...prev, [id]: rows }))

    const matIds    = rows.filter(i => i.raw_materials).map(i => i.raw_materials.id)
    const recipeIds = rows.filter(i => i.recipes).map(i => i.recipes.id)

    const [priceRes, recipeRes] = await Promise.all([
      matIds.length ? supabase.from('raw_materials_with_price').select('id, current_price').in('id', matIds) : { data: [] },
      recipeIds.length ? supabase.from('recipe_cost').select('recipe_id, cost_per_kg').in('recipe_id', recipeIds) : { data: [] },
    ])

    const priceMap  = Object.fromEntries((priceRes.data ?? []).map(p => [p.id, p]))
    const recipeMap = Object.fromEntries((recipeRes.data ?? []).map(r => [r.recipe_id, r]))

    const costMap = {}; let total = 0
    for (const item of rows) {
      let itemCost = null
      if (item.raw_materials) {
        const p = priceMap[item.raw_materials.id]
        if (p?.current_price != null) itemCost = Number(p.current_price) * toKg(item.quantity, item.unit)
      } else if (item.recipes) {
        const r = recipeMap[item.recipes.id]
        if (r?.cost_per_kg != null) itemCost = Number(r.cost_per_kg) * toKg(item.quantity, item.unit)
      }
      costMap[item.id] = itemCost
      if (itemCost != null) total += itemCost
    }

    setCosts(prev => ({ ...prev, [id]: { map: costMap, total } }))
    setItemsLoading(prev => ({ ...prev, [id]: false }))
  }

  // Клик по заголовку проекта — ПЕРЕКЛЮЧАЕТ аккордеон
  async function toggleProject(id) {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id)
    if (!items[id]) await fetchItems(id)
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
    setItems(prev => { const n = { ...prev }; delete n[editProject.id]; return n })
    setCosts(prev => { const n = { ...prev }; delete n[editProject.id]; return n })
    setProjects(prev => prev.map(p => p.id === editProject.id ? { ...p, name: editName.trim() || p.name } : p))
    if (openId === editProject.id) setOpenId(null)
    setSaving(false); setEditProject(null)
  }

  async function removeEditItem(itemId) {
    await supabase.from('project_items').delete().eq('id', itemId)
    setEditItems(prev => prev.filter(i => i.id !== itemId))
    setItems(prev => ({ ...prev, [editProject.id]: (prev[editProject.id] ?? []).filter(i => i.id !== itemId) }))
    setCosts(prev => { const n = { ...prev }; delete n[editProject.id]; return n })
  }

  function setEditQty(id, val) { setEditItems(prev => prev.map(i => i.id === id ? { ...i, quantity: val } : i)) }
  function setEditUnit(id, val) { setEditItems(prev => prev.map(i => i.id === id ? { ...i, unit: val } : i)) }

  // Открыть форму продвижения — НЕ сворачивает аккордеон
  async function openPromote(p) {
    setOpenId(p.id)                         // убедиться что открыт
    if (!items[p.id]) await fetchItems(p.id) // загрузить если не загружено
    setPromote(prev => ({ ...prev, [p.id]: { ...emptyPromote } }))
  }

  function updatePromote(pid, field, value) {
    setPromote(prev => ({ ...prev, [pid]: { ...prev[pid], [field]: value } }))
  }

  async function savePromoteRecipe(p) {
    const form = promote[p.id]
    if (!form.article.trim() || !form.name.trim()) {
      updatePromote(p.id, 'error', 'Заполните артикул и название'); return
    }
    updatePromote(p.id, 'saving', true); updatePromote(p.id, 'error', '')

    const { data: rec, error: recErr } = await supabase
      .from('recipes')
      .insert({ article: form.article.trim(), name: form.name.trim(), output_quantity: 1, output_unit: 'кг' })
      .select('id').single()

    if (recErr || !rec) { updatePromote(p.id, 'error', 'Ошибка создания рецепта'); updatePromote(p.id, 'saving', false); return }

    const its = items[p.id] ?? []
    const ingredients = its.filter(i => i.raw_materials).map(i => ({
      recipe_id:   rec.id,
      material_id: i.raw_materials.id,
      // конвертируем всё в кг
      quantity: i.unit === 'г' ? parseFloat(i.quantity) / 1000 : parseFloat(i.quantity),
      unit:     'кг',
    }))
    if (ingredients.length) await supabase.from('recipe_ingredients').insert(ingredients)

    await supabase.from('projects').update({
      linked_id: rec.id, linked_article: form.article.trim(), linked_name: form.name.trim()
    }).eq('id', p.id)

    setProjects(prev => prev.map(pr => pr.id === p.id
      ? { ...pr, linked_id: rec.id, linked_article: form.article.trim(), linked_name: form.name.trim() } : pr))
    setPromote(prev => ({ ...prev, [p.id]: { ...prev[p.id], saving: false, done: true } }))
  }

  async function savePromoteSku(p) {
    const form = promote[p.id]
    if (!form.article.trim() || !form.name.trim()) {
      updatePromote(p.id, 'error', 'Заполните артикул и название'); return
    }
    updatePromote(p.id, 'saving', true); updatePromote(p.id, 'error', '')

    const pkgSize = parseFloat(form.packageSize) || null

    const { data: prod, error: prodErr } = await supabase
      .from('products')
      .insert({
        article: form.article.trim(), name: form.name.trim(),
        package_size: pkgSize, package_unit: 'шт',  // SKU всегда в штуках
      })
      .select('id').single()

    if (prodErr || !prod) { updatePromote(p.id, 'error', 'Ошибка создания SKU'); updatePromote(p.id, 'saving', false); return }

    const its = items[p.id] ?? []
    const components = its.map(i => ({
      product_id:  prod.id,
      recipe_id:   i.recipes      ? i.recipes.id       : null,
      material_id: i.raw_materials ? i.raw_materials.id : null,
      quantity:    parseFloat(i.quantity) || 0,
      unit:        i.unit,
    }))
    if (components.length) await supabase.from('sku_recipe_components').insert(components)

    await supabase.from('projects').update({
      linked_id: prod.id, linked_article: form.article.trim(), linked_name: form.name.trim()
    }).eq('id', p.id)

    setProjects(prev => prev.map(pr => pr.id === p.id
      ? { ...pr, linked_id: prod.id, linked_article: form.article.trim(), linked_name: form.name.trim() } : pr))
    setPromote(prev => ({ ...prev, [p.id]: { ...prev[p.id], saving: false, done: true } }))
  }

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
              const prom      = promote[p.id]
              const isSku     = p.type === 'sku'

              return (
                <div key={p.id} className={`card overflow-hidden transition-all ${editProject?.id === p.id ? 'border-gold/30' : ''}`}>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleProject(p.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
                    >
                      {openId === p.id
                        ? <ChevronDown size={16} className="text-gold flex-shrink-0" />
                        : <ChevronRight size={16} className="text-muted flex-shrink-0" />}
                      <span className="text-cream font-body font-medium text-sm truncate">{p.name}</span>
                      <span className="text-muted text-xs font-mono flex-shrink-0 ml-2">{fmtDate(p.created_at)}</span>
                      {p.linked_article && (
                        <span className="flex items-center gap-1 ml-2 badge bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 text-xs font-mono flex-shrink-0">
                          <Link size={10} /> {p.linked_article}
                        </span>
                      )}
                    </button>

                    <div className="relative ml-3 flex-shrink-0" ref={menuId === p.id ? menuRef : null}>
                      <button
                        onClick={() => { setMenuId(menuId === p.id ? null : p.id); setConfirmId(null) }}
                        className="p-1.5 rounded-md text-muted hover:text-cream hover:bg-forest-light/50 transition-colors"
                      ><MoreHorizontal size={16} /></button>

                      {menuId === p.id && (
                        <div className="absolute right-0 top-8 z-50 w-44 bg-forest border border-forest-light/50 rounded-lg shadow-lg overflow-hidden">
                          <button onClick={() => openEdit(p)}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-body text-cream hover:bg-forest-light/50 transition-colors text-left">
                            <Pencil size={13} className="text-muted" /> Изменить
                          </button>
                          {confirmId === p.id ? (
                            <div className="px-4 py-2.5 border-t border-forest-light/30">
                              <p className="text-xs text-muted font-body mb-2">Удалить проект?</p>
                              <div className="flex gap-3">
                                <button onClick={() => deleteProject(p.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"><Check size={12} /> Да</button>
                                <button onClick={() => setConfirmId(null)} className="flex items-center gap-1 text-xs text-muted hover:text-cream"><X size={12} /> Нет</button>
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
                                      <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">{obj?.article ?? '—'}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-cream font-body text-xs">{obj?.name ?? '—'}</td>
                                    <td className="px-4 py-2.5">
                                      <span className={`badge text-xs font-body ${isRecipe ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-forest-light/40 text-muted border border-forest-light/40'}`}>
                                        {isRecipe ? 'Рецепт' : 'Сырьё'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">{item.quantity} {item.unit}</td>
                                    <td className="px-6 py-2.5 text-right font-mono text-xs text-gold">{itemCost != null ? fmt(itemCost) : '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>

                          {projCosts && (
                            <div className="border-t-2 border-forest-light/30 mx-6 mt-1 pt-3 pb-4 flex justify-between items-center">
                              <span className="text-muted text-xs font-body uppercase tracking-widest">Итого себестоимость</span>
                              <span className="text-gold font-mono font-semibold text-sm">{fmt(projCosts.total)} руб.</span>
                            </div>
                          )}

                          <div className="mx-6 pb-2">
                            {p.linked_article ? (
                              <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
                                <Link size={13} className="text-emerald-400 flex-shrink-0" />
                                <span className="text-emerald-400 text-xs font-body">
                                  Добавлен в {isSku ? 'SKU' : 'рецепты'} как <span className="font-mono">{p.linked_article}</span> — {p.linked_name}
                                </span>
                              </div>
                            ) : !prom ? (
                              <button
                                onClick={() => openPromote(p)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gold/20 bg-gold/10 text-gold text-xs font-body hover:bg-gold/20 transition-all"
                              >
                                <PlusCircle size={13} />
                                Добавить в {isSku ? 'SKU' : 'рецепты'}
                              </button>
                            ) : prom.done ? (
                              <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
                                <Check size={13} className="text-emerald-400" />
                                <span className="text-emerald-400 text-xs font-body">Успешно добавлено!</span>
                              </div>
                            ) : (
                              <div className="border border-forest-light/40 rounded-lg p-4 bg-forest/50">
                                <p className="text-muted text-xs font-body uppercase tracking-widest mb-3">
                                  Добавить в {isSku ? 'SKU' : 'рецепты'}
                                </p>
                                <div className="space-y-3">
                                  <div>
                                    <label className="text-muted text-xs font-body block mb-1">Артикул</label>
                                    <input value={prom.article}
                                      onChange={e => updatePromote(p.id, 'article', e.target.value)}
                                      placeholder={isSku ? 'Например: 4201-ЗИП100' : 'Например: 4201'}
                                      className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-1.5 text-cream text-sm font-mono focus:outline-none focus:border-gold/50" />
                                  </div>
                                  <div>
                                    <label className="text-muted text-xs font-body block mb-1">Точное название</label>
                                    <input value={prom.name}
                                      onChange={e => updatePromote(p.id, 'name', e.target.value)}
                                      placeholder={isSku ? 'Например: Ассам TGFOP, 100 гр' : 'Например: Ассам TGFOP'}
                                      className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-1.5 text-cream text-sm font-body focus:outline-none focus:border-gold/50" />
                                  </div>

                                  {/* Рецепт: выход всегда 1 кг */}
                                  {!isSku && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-forest-light/20 border border-forest-light/30">
                                      <span className="text-muted text-xs font-body">Выход рецепта:</span>
                                      <span className="text-cream text-xs font-mono">1 кг</span>
                                    </div>
                                  )}

                                  {/* SKU: фасовка в штуках */}
                                  {isSku && (
                                    <div>
                                      <label className="text-muted text-xs font-body block mb-1">
                                        Фасовка, шт
                                      </label>
                                      <div className="flex items-center gap-2">
                                        <input type="number" value={prom.packageSize}
                                          onChange={e => updatePromote(p.id, 'packageSize', e.target.value)}
                                          placeholder="1"
                                          className="flex-1 bg-forest border border-forest-light/40 rounded-lg px-3 py-1.5 text-cream text-sm font-mono focus:outline-none focus:border-gold/50" />
                                        <span className="text-muted text-sm font-mono">шт</span>
                                      </div>
                                    </div>
                                  )}

                                  {prom.error && <p className="text-red-400 text-xs font-body">{prom.error}</p>}

                                  <div className="flex gap-2 pt-1">
                                    <button
                                      onClick={() => isSku ? savePromoteSku(p) : savePromoteRecipe(p)}
                                      disabled={prom.saving}
                                      className="flex-1 py-1.5 rounded-lg bg-gold/15 text-gold border border-gold/20 text-xs font-body hover:bg-gold/25 transition-all disabled:opacity-50"
                                    >
                                      {prom.saving ? 'Сохранение...' : 'Сохранить'}
                                    </button>
                                    <button
                                      onClick={() => setPromote(prev => { const n = { ...prev }; delete n[p.id]; return n })}
                                      className="px-3 py-1.5 rounded-lg text-muted hover:text-cream border border-forest-light/30 text-xs font-body"
                                    >
                                      Отмена
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {editProject && (
            <div className="w-80 flex-shrink-0 card">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-display text-sm font-semibold text-cream">Изменить проект</h3>
                <button onClick={() => setEditProject(null)} className="text-muted hover:text-cream"><X size={16} /></button>
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
                          <button onClick={() => removeEditItem(item.id)} className="text-muted hover:text-red-400 flex-shrink-0"><Trash2 size={12} /></button>
                        </div>
                        <div className="flex gap-2">
                          <input type="number" min="0" step="0.01" value={item.quantity}
                            onChange={e => setEditQty(item.id, e.target.value)}
                            className="flex-1 bg-forest border border-forest-light/40 rounded-lg px-2 py-1 text-cream text-xs font-mono focus:outline-none focus:border-gold/50" />
                          <select value={item.unit} onChange={e => setEditUnit(item.id, e.target.value)}
                            className="bg-forest border border-forest-light/40 rounded-lg px-2 py-1 text-cream text-xs font-mono focus:outline-none focus:border-gold/50 appearance-none w-14">
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
