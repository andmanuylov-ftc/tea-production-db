import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search, Filter } from 'lucide-react'

export default function SKUs() {
  const [rows, setRows] = useState([])
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    Promise.all([
      supabase
        .from('sku_cost')
        .select('sku_article, product_name, blend_cost, packaging_cost, total_sku_cost, product_id')
        .order('sku_article'),
      supabase
        .from('product_types')
        .select('id, code, name')
        .not('code', 'like', '_')
        .not('code', 'like', '__')
        .order('code'),
      supabase
        .from('products')
        .select('id, type_id')
    ]).then(([skus, typeRes, products]) => {
      const prodMap = Object.fromEntries((products.data ?? []).map(p => [p.id, p.type_id]))
      const enriched = (skus.data ?? []).map(s => ({
        ...s,
        type_id: prodMap[s.product_id]
      }))
      setRows(enriched)
      setTypes(typeRes.data ?? [])
      setLoading(false)
    })
  }, [])

  const leafTypes = types.filter(t => t.code.split('.').length === 3 || ['1.4','1.5','2.1','3'].includes(t.code))

  const filtered = rows.filter(r => {
    const matchSearch = r.sku_article.toLowerCase().includes(search.toLowerCase()) ||
      r.product_name.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || String(r.type_id) === String(typeFilter)
    return matchSearch && matchType
  })

  return (
    <div className="p-8">
      <PageHeader title="SKU" subtitle={`${rows.length} позиций`} />

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск…"
            className="w-full bg-forest border border-forest-light/40 rounded-lg pl-9 pr-4 py-2
                       text-cream text-sm font-body placeholder-muted/60
                       focus:outline-none focus:border-gold/50"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-forest border border-forest-light/40 rounded-lg pl-9 pr-8 py-2
                       text-cream text-sm font-body focus:outline-none focus:border-gold/50
                       appearance-none cursor-pointer"
          >
            <option value="all">Все категории</option>
            {leafTypes.map(t => (
              <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-forest">
            <tr className="text-left">
              <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
              <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
              <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Купаж</th>
              <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Упаковка</th>
              <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Итого, руб</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-muted text-sm text-center font-body">Ничего не найдено</td></tr>
            ) : filtered.map(r => (
              <tr key={r.sku_article} className="table-row">
                <td className="p-4">
                  <span className="badge bg-forest-light text-cream border border-forest-light font-mono">
                    {r.sku_article}
                  </span>
                </td>
                <td className="p-4 text-cream text-sm font-body">{r.product_name}</td>
                <td className="p-4 text-right font-mono text-sm text-muted">
                  {Number(r.blend_cost).toFixed(2)}
                </td>
                <td className="p-4 text-right font-mono text-sm text-muted">
                  {Number(r.packaging_cost).toFixed(2)}
                </td>
                <td className="p-4 text-right font-mono text-sm font-semibold text-gold">
                  {Number(r.total_sku_cost).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
