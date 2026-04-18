import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { FlaskConical, Package, ChevronDown, ChevronRight } from 'lucide-react'

const TABS = [
  { key: 'recipe', icon: FlaskConical, label: 'Рецепты' },
  { key: 'sku',    icon: Package,      label: 'SKU' },
]

export default function Project() {
  const [tab, setTab]         = useState('recipe')
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [openId, setOpenId]     = useState(null)
  const [items, setItems]       = useState({})   // projectId -> items[]
  const [itemsLoading, setItemsLoading] = useState({})

  useEffect(() => {
    setLoading(true)
    setOpenId(null)
    supabase
      .from('projects')
      .select('id, name, type, created_at, notes')
      .eq('type', tab)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setProjects(data ?? []); setLoading(false) })
  }, [tab])

  async function loadItems(id) {
    if (items[id]) { setOpenId(openId === id ? null : id); return }
    setOpenId(id)
    setItemsLoading(prev => ({ ...prev, [id]: true }))
    const { data } = await supabase
      .from('project_items')
      .select('id, quantity, unit, raw_materials(article, name)')
      .eq('project_id', id)
      .order('created_at')
    setItems(prev => ({ ...prev, [id]: data ?? [] }))
    setItemsLoading(prev => ({ ...prev, [id]: false }))
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="p-8">
      <PageHeader title="Проект" subtitle="Сохранённые конструкции" />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-forest rounded-lg p-1 w-fit">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
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

      {loading ? (
        <p className="text-muted text-sm font-mono animate-pulse">Загрузка...</p>
      ) : projects.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-muted text-sm font-body">Нет сохранённых проектов</p>
          <p className="text-muted/50 text-xs font-body mt-1">Создайте в разделе «Конструктор»</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map(p => (
            <div key={p.id} className="card overflow-hidden">
              <button
                onClick={() => openId === p.id ? setOpenId(null) : loadItems(p.id)}
                className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-3">
                  {openId === p.id
                    ? <ChevronDown size={16} className="text-gold" />
                    : <ChevronRight size={16} className="text-muted" />}
                  <span className="text-cream font-body font-medium text-sm">{p.name}</span>
                </div>
                <span className="text-muted text-xs font-mono">{fmtDate(p.created_at)}</span>
              </button>

              {openId === p.id && (
                <div className="mt-4 -mx-6">
                  {itemsLoading[p.id] ? (
                    <p className="px-6 text-muted text-xs font-mono animate-pulse">Загрузка...</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-forest-light/20">
                          <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-6 py-2">Артикул</th>
                          <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-2">Название</th>
                          <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-6 py-2">Количество</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(items[p.id] ?? []).map(item => (
                          <tr key={item.id} className="border-t border-forest-light/10 hover:bg-forest-light/5">
                            <td className="px-6 py-2">
                              <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">
                                {item.raw_materials?.article}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-cream font-body text-xs">{item.raw_materials?.name}</td>
                            <td className="px-6 py-2 text-right font-mono text-xs text-gold">
                              {item.quantity} {item.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
