import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { FlaskConical, Package, ChevronDown, ChevronRight, Trash2, Check, X } from 'lucide-react'

const TABS = [
  { key: 'recipe', icon: FlaskConical, label: 'Рецепты' },
  { key: 'sku',    icon: Package,      label: 'SKU' },
]

export default function Project() {
  const [tab, setTab]           = useState('recipe')
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [openId, setOpenId]     = useState(null)
  const [items, setItems]       = useState({})
  const [itemsLoading, setItemsLoading] = useState({})
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    loadProjects()
  }, [tab])

  async function loadProjects() {
    setLoading(true)
    setOpenId(null)
    setConfirmId(null)
    const { data } = await supabase
      .from('projects')
      .select('id, name, type, created_at')
      .eq('type', tab)
      .order('created_at', { ascending: false })
    setProjects(data ?? [])
    setLoading(false)
  }

  async function loadItems(id) {
    if (items[id]) { setOpenId(openId === id ? null : id); return }
    setOpenId(id)
    setItemsLoading(prev => ({ ...prev, [id]: true }))
    const { data } = await supabase
      .from('project_items')
      .select('id, quantity, unit, raw_materials(article, name), recipes(article, name)')
      .eq('project_id', id)
      .order('created_at')
    setItems(prev => ({ ...prev, [id]: data ?? [] }))
    setItemsLoading(prev => ({ ...prev, [id]: false }))
  }

  async function deleteProject(id) {
    await supabase.from('projects').delete().eq('id', id)
    setConfirmId(null)
    setProjects(prev => prev.filter(p => p.id !== id))
    if (openId === id) setOpenId(null)
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="p-8">
      <PageHeader title="Проект" subtitle="Сохранённые конструкции" />

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

              {/* Заголовок строки */}
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

                {/* Удалить */}
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  {confirmId === p.id ? (
                    <>
                      <span className="text-xs text-muted font-body">Удалить?</span>
                      <button
                        onClick={() => deleteProject(p.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                        title="Да, удалить"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-muted hover:text-cream transition-colors"
                        title="Отмена"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(p.id)}
                      className="text-muted hover:text-red-400 transition-colors"
                      title="Удалить проект"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Раскрытый состав */}
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
                          <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-2">Тип</th>
                          <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-6 py-2">Количество</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(items[p.id] ?? []).map(item => {
                          const isRecipe = !!item.recipes
                          const obj = isRecipe ? item.recipes : item.raw_materials
                          return (
                            <tr key={item.id} className="border-t border-forest-light/10 hover:bg-forest-light/5">
                              <td className="px-6 py-2">
                                <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">
                                  {obj?.article ?? '—'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-cream font-body text-xs">{obj?.name ?? '—'}</td>
                              <td className="px-4 py-2">
                                <span className={`badge text-xs font-body ${
                                  isRecipe
                                    ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
                                    : 'bg-forest-light/40 text-muted border border-forest-light/40'
                                }`}>
                                  {isRecipe ? 'Рецепт' : 'Сырьё'}
                                </span>
                              </td>
                              <td className="px-6 py-2 text-right font-mono text-xs text-gold">
                                {item.quantity} {item.unit}
                              </td>
                            </tr>
                          )
                        })}
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
