import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search, X, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

export default function Recipes() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [ingredients, setIngredients] = useState([])

  // menu / edit / delete
  const [openMenu,     setOpenMenu]     = useState(null)  // recipe_article
  const [editRecipe,   setEditRecipe]   = useState(null)  // row object
  const [editForm,     setEditForm]     = useState({})
  const [deleteRecipe, setDeleteRecipe] = useState(null)  // row object
  const [deleteError,  setDeleteError]  = useState('')
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  useEffect(() => {
    supabase
      .from('recipe_cost')
      .select('recipe_id, recipe_article, recipe_name, total_cost')
      .order('recipe_article')
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [])

  async function openRecipe(article) {
    if (selected === article) { setSelected(null); setIngredients([]); return }
    setSelected(article)
    const { data: rec } = await supabase.from('recipes').select('id').eq('article', article).single()
    if (!rec) return
    const { data } = await supabase
      .from('recipe_ingredients')
      .select(`
        quantity, unit,
        raw_materials ( article, name ),
        sub_recipe:recipes!sub_recipe_id ( article, name )
      `)
      .eq('recipe_id', rec.id)
    setIngredients(data ?? [])
  }

  // ── Edit ──
  function startEdit(row, e) {
    e.stopPropagation()
    setOpenMenu(null)
    setEditRecipe(row)
    setEditForm({ article: row.recipe_article, name: row.recipe_name })
  }

  async function saveEdit() {
    if (!editRecipe) return
    setSaving(true)
    const { error } = await supabase.from('recipes').update({
      article: editForm.article.trim(),
      name:    editForm.name.trim(),
    }).eq('id', editRecipe.recipe_id)
    if (!error) {
      setRows(prev => prev.map(r =>
        r.recipe_id === editRecipe.recipe_id
          ? { ...r, recipe_article: editForm.article.trim(), recipe_name: editForm.name.trim() }
          : r
      ))
      if (selected === editRecipe.recipe_article) setSelected(editForm.article.trim())
      setEditRecipe(null)
    }
    setSaving(false)
  }

  // ── Delete ──
  async function startDelete(row, e) {
    e.stopPropagation()
    setOpenMenu(null)
    setDeleteError('')
    // Проверяем: есть ли SKU, привязанные к этому рецепту
    const { data: linked } = await supabase
      .from('products')
      .select('article')
      .eq('recipe_id', row.recipe_id)
      .limit(5)
    if (linked && linked.length > 0) {
      setDeleteError(`Рецепт используется в SKU: ${linked.map(p => p.article).join(', ')}. Сначала удалите SKU.`)
    }
    setDeleteRecipe(row)
  }

  async function confirmDelete() {
    if (!deleteRecipe || deleteError) return
    setDeleting(true)
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', deleteRecipe.recipe_id)
    await supabase.from('recipes').delete().eq('id', deleteRecipe.recipe_id)
    setRows(prev => prev.filter(r => r.recipe_id !== deleteRecipe.recipe_id))
    if (selected === deleteRecipe.recipe_article) { setSelected(null); setIngredients([]) }
    setDeleteRecipe(null)
    setDeleting(false)
  }

  const filtered = rows.filter(r =>
    r.recipe_article.toLowerCase().includes(search.toLowerCase()) ||
    r.recipe_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <PageHeader title="Рецепты" subtitle={`${rows.length} купажей в базе`} />

      {/* Search */}
      <div className="relative mb-6 w-80">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по артикулу или названию…"
          className="w-full bg-forest border border-forest-light/40 rounded-lg pl-9 pr-4 py-2
                     text-cream text-sm font-body placeholder-muted/60
                     focus:outline-none focus:border-gold/50"
        />
      </div>

      {/* Click-outside overlay for menu */}
      {openMenu && <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />}

      <div className="flex gap-6">
        {/* Table */}
        <div className="flex-1 card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-forest">
              <tr className="text-left">
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">руб/кг</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
              ) : filtered.map(r => (
                <tr
                  key={r.recipe_article}
                  className={`table-row cursor-pointer ${
                    selected === r.recipe_article ? 'bg-gold/10' : ''
                  }`}
                  onClick={() => openRecipe(r.recipe_article)}
                >
                  <td className="p-4">
                    <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono">
                      {r.recipe_article}
                    </span>
                  </td>
                  <td className="p-4 text-cream text-sm font-body">{r.recipe_name}</td>
                  <td className="p-4 text-right font-mono text-sm text-gold">
                    {Number(r.total_cost).toFixed(2)}
                  </td>
                  <td className="pr-3 text-right relative" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenMenu(openMenu === r.recipe_article ? null : r.recipe_article)}
                      className="text-muted hover:text-cream p-1.5 rounded hover:bg-forest-light/30 transition-colors"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {openMenu === r.recipe_article && (
                      <div className="absolute right-3 top-9 z-50 bg-forest-dark border border-forest-light/50 rounded-lg shadow-2xl py-1 w-40">
                        <button
                          onClick={e => startEdit(r, e)}
                          className="w-full text-left px-4 py-2 text-sm text-cream hover:bg-forest-light/30 font-body flex items-center gap-2"
                        >
                          <Pencil size={13} /> Редактировать
                        </button>
                        <button
                          onClick={e => startDelete(r, e)}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 font-body flex items-center gap-2"
                        >
                          <Trash2 size={13} /> Удалить
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 card flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-cream">
                Состав рецепта
                <span className="ml-2 badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs">
                  {selected}
                </span>
              </h3>
              <button onClick={() => { setSelected(null); setIngredients([]) }} className="text-muted hover:text-cream transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, i) => {
                const name = ing.raw_materials?.name ?? ing.sub_recipe?.name ?? '—'
                const art  = ing.raw_materials?.article ?? ing.sub_recipe?.article ?? ''
                return (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-forest-light/30">
                    <div>
                      <div className="text-cream text-xs font-body">{name}</div>
                      <div className="text-muted text-xs font-mono">{art}</div>
                    </div>
                    <div className="text-gold font-mono text-xs ml-4 whitespace-nowrap">
                      {ing.quantity} {ing.unit}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/80 backdrop-blur-sm">
          <div className="bg-forest border border-forest-light/40 rounded-xl p-6 w-[420px] shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg text-cream">Редактировать рецепт</h3>
              <button onClick={() => setEditRecipe(null)} className="text-muted hover:text-cream"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Артикул</label>
                <input
                  value={editForm.article}
                  onChange={e => setEditForm(f => ({ ...f, article: e.target.value }))}
                  className="w-full bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-mono focus:outline-none focus:border-gold/50"
                />
              </div>
              <div>
                <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Название</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-body focus:outline-none focus:border-gold/50"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setEditRecipe(null)} className="px-4 py-2 text-sm text-muted hover:text-cream font-body transition-colors">Отмена</button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/80 backdrop-blur-sm">
          <div className="bg-forest border border-forest-light/40 rounded-xl p-6 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-cream">Удалить рецепт?</h3>
              <button onClick={() => setDeleteRecipe(null)} className="text-muted hover:text-cream"><X size={16} /></button>
            </div>
            <div className="bg-forest-dark rounded-lg p-3 mb-4">
              <span className="font-mono text-gold text-sm">{deleteRecipe.recipe_article}</span>
              <span className="text-cream text-sm font-body ml-2">{deleteRecipe.recipe_name}</span>
            </div>
            {deleteError ? (
              <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 mb-5">
                <p className="text-red-400 text-xs font-body">{deleteError}</p>
              </div>
            ) : (
              <p className="text-red-400 text-xs font-body mb-5">Будут удалены рецепт и все его ингредиенты. Это действие необратимо.</p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteRecipe(null)} className="px-4 py-2 text-sm text-muted hover:text-cream font-body transition-colors">Отмена</button>
              {!deleteError && (
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="bg-red-800 hover:bg-red-700 text-red-100 text-sm px-4 py-2 rounded-lg font-body transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Trash2 size={13} />{deleting ? 'Удаление...' : 'Удалить'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
