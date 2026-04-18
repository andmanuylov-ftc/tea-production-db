import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Plus, Trash2, Package, FlaskConical, Search, X } from 'lucide-react'

const META = {
  OLD_TEA: { label: 'Старый ассортимент', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  NEW_TEA: { label: 'Новый ассортимент',  color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
}

const TABS = [
  { key: 'recipes', icon: FlaskConical, label: 'Рецепты' },
  { key: 'sku',     icon: Package,      label: 'SKU' },
]

export default function AssortmentDetail() {
  const { code } = useParams()
  const navigate = useNavigate()
  const m = META[code] ?? { label: code, color: 'text-gold', bg: 'bg-gold/10', border: 'border-gold/30' }

  const [assortmentId, setAssortmentId] = useState(null)
  const [tab, setTab] = useState('recipes')
  const [items, setItems] = useState([])
  const [allOptions, setAllOptions] = useState([])
  const [search, setSearch] = useState('')
  const [addSearch, setAddSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('assortments').select('id').eq('code', code).single()
      .then(({ data }) => data && setAssortmentId(data.id))
  }, [code])

  const loadItems = useCallback(async () => {
    if (!assortmentId) return
    setLoading(true)
    if (tab === 'sku') {
      const { data } = await supabase
        .from('assortment_products')
        .select('id, notes, products(id, article, name)')
        .eq('assortment_id', assortmentId)
        .order('id')
      setItems(data ?? [])
    } else {
      const { data } = await supabase
        .from('assortment_recipes')
        .select('id, notes, recipes(id, article, name)')
        .eq('assortment_id', assortmentId)
        .order('id')
      setItems(data ?? [])
    }
    setLoading(false)
  }, [assortmentId, tab])

  const loadAllOptions = useCallback(async () => {
    if (tab === 'sku') {
      const { data } = await supabase.from('products').select('id, article, name').order('article')
      setAllOptions(data ?? [])
    } else {
      const { data } = await supabase.from('recipes').select('id, article, name').order('article')
      setAllOptions(data ?? [])
    }
  }, [tab])

  useEffect(() => { loadItems() }, [loadItems])
  useEffect(() => { loadAllOptions() }, [loadAllOptions])

  const inAssortment = new Set(
    items.map(i => tab === 'sku' ? i.products?.id : i.recipes?.id)
  )

  async function addItem(option) {
    if (!assortmentId || inAssortment.has(option.id)) return
    setSaving(true)
    if (tab === 'sku') {
      await supabase.from('assortment_products').insert({ assortment_id: assortmentId, product_id: option.id })
    } else {
      await supabase.from('assortment_recipes').insert({ assortment_id: assortmentId, recipe_id: option.id })
    }
    await loadItems()
    setSaving(false)
  }

  async function removeItem(rowId) {
    setSaving(true)
    const table = tab === 'sku' ? 'assortment_products' : 'assortment_recipes'
    await supabase.from(table).delete().eq('id', rowId)
    await loadItems()
    setSaving(false)
  }

  const filtered = items.filter(i => {
    const obj = tab === 'sku' ? i.products : i.recipes
    const q = search.toLowerCase()
    return (obj?.article ?? '').toLowerCase().includes(q) || (obj?.name ?? '').toLowerCase().includes(q)
  })

  const addFiltered = allOptions.filter(o => {
    if (inAssortment.has(o.id)) return false
    const q = addSearch.toLowerCase()
    return o.article.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
  })

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/assortments')} className="text-muted hover:text-cream transition-colors">
          <ArrowLeft size={18} />
        </button>
        <span className={`font-mono text-xs font-semibold tracking-widest ${m.color}`}>{code}</span>
      </div>
      <h1 className="font-display text-2xl font-semibold text-cream mb-1">{m.label}</h1>
      <p className="text-muted text-sm font-body mb-6">{items.length} позиций в текущей вкладке</p>

      <div className="flex gap-1 mb-6 bg-forest rounded-lg p-1 w-fit">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSearch(''); setAddSearch(''); setShowAdd(false) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-body transition-all ${
              tab === key
                ? 'bg-gold/15 text-gold border border-gold/20'
                : 'text-muted hover:text-cream'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
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
            <button
              onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/15 text-gold border border-gold/20
                         text-sm font-body hover:bg-gold/25 transition-all"
            >
              <Plus size={14} />
              Добавить
            </button>
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead className="bg-forest">
                <tr className="text-left">
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
                  <th className="text-muted text-xs uppercase tracking-widest p-4 font-body w-12"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={3} className="p-4 text-muted text-sm font-body">Пусто — добавьте позиции через кнопку «Добавить»</td></tr>
                ) : filtered.map(row => {
                  const obj = tab === 'sku' ? row.products : row.recipes
                  return (
                    <tr key={row.id} className="table-row">
                      <td className="p-4">
                        <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono">{obj?.article}</span>
                      </td>
                      <td className="p-4 text-cream text-sm font-body">{obj?.name}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => removeItem(row.id)} disabled={saving} className="text-muted hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {showAdd && (
          <div className="w-80 flex-shrink-0 card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-sm font-semibold text-cream">
                Добавить {tab === 'sku' ? 'SKU' : 'рецепт'}
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-muted hover:text-cream">
                <X size={16} />
              </button>
            </div>

            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
                placeholder="Поиск…"
                className="w-full bg-forest border border-forest-light/40 rounded-lg pl-8 pr-3 py-1.5
                           text-cream text-sm font-body placeholder-muted/60
                           focus:outline-none focus:border-gold/50"
              />
            </div>

            <div className="space-y-1 max-h-96 overflow-y-auto">
              {addFiltered.length === 0 ? (
                <p className="text-muted text-xs font-body py-2">Все позиции уже добавлены</p>
              ) : addFiltered.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => addItem(opt)}
                  disabled={saving}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-forest-light/40 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs text-gold">{opt.article}</span>
                      <div className="text-cream text-xs font-body leading-tight mt-0.5">{opt.name}</div>
                    </div>
                    <Plus size={13} className="text-muted group-hover:text-gold transition-colors flex-shrink-0 ml-2" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
