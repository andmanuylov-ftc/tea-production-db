import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search } from 'lucide-react'

export default function Recipes() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [ingredients, setIngredients] = useState([])

  useEffect(() => {
    supabase
      .from('recipe_cost')
      .select('recipe_article, recipe_name, total_cost')
      .order('recipe_article')
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [])

  async function openRecipe(article) {
    setSelected(article)
    const { data } = await supabase
      .from('recipe_ingredients')
      .select(`
        quantity, unit,
        raw_materials ( article, name ),
        sub_recipe:recipes!sub_recipe_id ( article, name )
      `)
      .eq('recipe_id', (await supabase.from('recipes').select('id').eq('article', article).single()).data.id)
    setIngredients(data ?? [])
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

      <div className="flex gap-6">
        {/* Table */}
        <div className="flex-1 card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-forest">
              <tr className="text-left">
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">руб/кг</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 card flex-shrink-0">
            <h3 className="font-display text-base font-semibold text-cream mb-4">
              Состав рецепта
              <span className="ml-2 badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs">
                {selected}
              </span>
            </h3>
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
    </div>
  )
}
