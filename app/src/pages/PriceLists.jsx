import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Download, Plus } from 'lucide-react'

export default function PriceLists() {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMarkup, setNewMarkup] = useState('')

  useEffect(() => {
    supabase
      .from('price_lists')
      .select('id, name, markup_percent')
      .order('name')
      .then(({ data }) => { setLists(data ?? []); setLoading(false) })
  }, [])

  async function createList() {
    if (!newName || !newMarkup) return
    const { data } = await supabase
      .from('price_lists')
      .insert({ name: newName, markup_percent: parseFloat(newMarkup) })
      .select()
      .single()
    if (data) {
      setLists(prev => [...prev, data])
      setNewName('')
      setNewMarkup('')
      setShowNew(false)
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Прайслисты"
        subtitle="Управление ценами и наценками"
        action={
          <button onClick={() => setShowNew(v => !v)} className="btn-primary flex items-center gap-2">
            <Plus size={14} />
            Новый прайслист
          </button>
        }
      />

      {/* New list form */}
      {showNew && (
        <div className="card mb-6 flex items-end gap-4">
          <div>
            <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Название</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Оптовый / Розничный…"
              className="bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                         text-cream text-sm font-body w-56 focus:outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Наценка %</label>
            <input
              type="number"
              value={newMarkup}
              onChange={e => setNewMarkup(e.target.value)}
              placeholder="30"
              className="bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                         text-cream text-sm font-mono w-24 focus:outline-none focus:border-gold/50"
            />
          </div>
          <button onClick={createList} className="btn-primary">Создать</button>
          <button onClick={() => setShowNew(false)} className="btn-ghost">Отмена</button>
        </div>
      )}

      {/* Lists */}
      {loading ? (
        <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
      ) : lists.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-muted text-sm font-body">Прайслистов пока нет</div>
          <div className="text-muted/60 text-xs font-body mt-1">Создайте первый с помощью кнопки выше</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {lists.map(l => (
            <div key={l.id} className="card flex items-center justify-between">
              <div>
                <div className="text-cream font-body font-medium">{l.name}</div>
                <div className="text-muted text-xs font-mono mt-1">Наценка: +{l.markup_percent}%</div>
              </div>
              <button
                className="btn-ghost flex items-center gap-2 text-gold hover:text-gold-light"
                title="Выгрузить Excel (скоро)"
              >
                <Download size={14} />
                Excel
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 rounded-lg border border-gold/20 bg-gold/5">
        <div className="text-gold text-xs font-body">
          💡 Выгрузка в Excel будет доступна после наполнения прайслистов позициями (Фаза 2)
        </div>
      </div>
    </div>
  )
}
