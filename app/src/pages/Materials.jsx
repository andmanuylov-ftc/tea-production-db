import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search } from 'lucide-react'

export default function Materials() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase
      .from('raw_materials')
      .select('id, article, name, unit')
      .order('article')
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [])

  const filtered = rows.filter(r =>
    r.article.toLowerCase().includes(search.toLowerCase()) ||
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <PageHeader title="Сырьё и материалы" subtitle={`${rows.length} позиций в базе`} />

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

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-forest">
            <tr className="text-left">
              <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
              <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
              <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Ед.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={3} className="p-8 text-muted text-sm text-center font-body">Ничего не найдено</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="table-row">
                <td className="p-4">
                  <span className="badge bg-forest-light text-cream border border-forest-light font-mono">
                    {r.article}
                  </span>
                </td>
                <td className="p-4 text-cream text-sm font-body">{r.name}</td>
                <td className="p-4 text-muted text-sm font-mono">{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
