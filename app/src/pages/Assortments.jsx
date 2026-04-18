import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Archive, Sparkles, ChevronRight } from 'lucide-react'

const META = {
  OLD_TEA: {
    icon: Archive,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    label: 'Старый ассортимент',
    hint: 'Текущий действующий ассортимент',
  },
  NEW_TEA: {
    icon: Sparkles,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    label: 'Новый ассортимент',
    hint: 'Новый ассортимент в разработке',
  },
}

export default function Assortments() {
  const navigate = useNavigate()
  const [assortments, setAssortments] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: list } = await supabase
        .from('assortments')
        .select('id, code, name, description')
        .order('code')

      if (!list) { setLoading(false); return }
      setAssortments(list)

      const c = {}
      await Promise.all(list.map(async (a) => {
        const [{ count: skuCount }, { count: recCount }] = await Promise.all([
          supabase.from('assortment_products').select('id', { count: 'exact', head: true }).eq('assortment_id', a.id),
          supabase.from('assortment_recipes').select('id',  { count: 'exact', head: true }).eq('assortment_id', a.id),
        ])
        c[a.code] = { sku: skuCount ?? 0, recipes: recCount ?? 0 }
      }))
      setCounts(c)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-8">
      <PageHeader title="Ассортименты" subtitle="Управление составом OLD_TEA и NEW_TEA" />

      {loading ? (
        <p className="text-muted text-sm font-mono animate-pulse">Загрузка...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
          {assortments.map((a) => {
            const m = META[a.code] ?? { icon: Archive, color: 'text-gold', bg: 'bg-gold/10', border: 'border-gold/20', label: a.name, hint: a.description }
            const Icon = m.icon
            const cnt = counts[a.code]
            return (
              <button
                key={a.code}
                onClick={() => navigate(`/assortments/${a.code}`)}
                className={`card text-left group hover:border-gold/40 transition-all hover:scale-[1.01] p-6 border ${m.border}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl ${m.bg} flex items-center justify-center`}>
                    <Icon size={22} className={m.color} />
                  </div>
                  <ChevronRight size={18} className="text-muted group-hover:text-gold transition-colors mt-1" />
                </div>

                <div className="mb-1">
                  <span className={`font-mono text-xs font-semibold tracking-widest ${m.color}`}>{a.code}</span>
                </div>
                <h2 className="font-display text-lg font-semibold text-cream mb-1">{m.label}</h2>
                <p className="text-muted text-sm font-body mb-5">{m.hint}</p>

                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="font-mono text-2xl font-semibold text-cream">{cnt?.sku ?? 0}</div>
                    <div className="text-muted text-xs font-body">SKU</div>
                  </div>
                  <div className="w-px bg-forest-light/40" />
                  <div className="text-center">
                    <div className="font-mono text-2xl font-semibold text-cream">{cnt?.recipes ?? 0}</div>
                    <div className="text-muted text-xs font-body">Рецептов</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
