import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import StatCard from '../components/StatCard'
import PageHeader from '../components/PageHeader'

export default function Dashboard() {
  const [stats, setStats] = useState({})
  const [recentRecipes, setRecentRecipes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [materials, recipes, products, costs] = await Promise.all([
        supabase.from('raw_materials').select('id', { count: 'exact', head: true }),
        supabase.from('recipes').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('recipe_cost').select('recipe_article, recipe_name, total_cost').order('total_cost', { ascending: false }).limit(5),
      ])
      setStats({
        materials: materials.count,
        recipes: recipes.count,
        products: products.count,
      })
      setRecentRecipes(costs.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-8">
      <PageHeader
        title="Дашборд"
        subtitle="Обзор производственной базы"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Сырьё и материалы" value={stats.materials} sub="позиций в базе" />
        <StatCard label="Рецепты" value={stats.recipes} sub="купажей" accent />
        <StatCard label="SKU" value={stats.products} sub="готовых позиций" />
      </div>

      {/* Top cost recipes */}
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-cream mb-4">
          Топ рецептов по себестоимости
        </h2>
        {loading ? (
          <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left">
                <th className="text-muted text-xs uppercase tracking-widest pb-3 font-body">Артикул</th>
                <th className="text-muted text-xs uppercase tracking-widest pb-3 font-body">Название</th>
                <th className="text-muted text-xs uppercase tracking-widest pb-3 font-body text-right">Себест. руб/кг</th>
              </tr>
            </thead>
            <tbody>
              {recentRecipes.map(r => (
                <tr key={r.recipe_article} className="table-row">
                  <td className="py-3 pr-6">
                    <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono">
                      {r.recipe_article}
                    </span>
                  </td>
                  <td className="py-3 text-cream text-sm font-body">{r.recipe_name}</td>
                  <td className="py-3 text-right font-mono text-sm text-gold">
                    {Number(r.total_cost).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
