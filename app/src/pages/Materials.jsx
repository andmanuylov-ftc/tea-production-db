import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search, Pencil, Trash2, X, Check, Clock, MoreHorizontal } from 'lucide-react'

export default function Materials() {
  const [rows, setRows]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [editRow, setEditRow]         = useState(null)
  const [editName, setEditName]       = useState('')
  const [editPrice, setEditPrice]     = useState('')
  const [history, setHistory]         = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [confirmId, setConfirmId]     = useState(null)
  const [openMenuId, setOpenMenuId]   = useState(null)
  const mounted = useRef(true)
  const menuRef = useRef(null)

  useEffect(() => {
    mounted.current = true
    loadRows()
    return () => { mounted.current = false }
  }, [])

  // Закрывать меню при клике вне его
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadRows() {
    const { data } = await supabase
      .from('raw_materials_with_price')
      .select('id, article, name, unit, current_price, price_date')
      .order('article')
    if (mounted.current) { setRows(data ?? []); setLoading(false) }
  }

  async function openEdit(row) {
    setOpenMenuId(null)
    setEditRow(row)
    setEditName(row.name)
    setEditPrice('')
    setHistory([])
    setHistLoading(true)
    const { data } = await supabase
      .from('material_prices')
      .select('price_per_unit, valid_from')
      .eq('material_id', row.id)
      .order('valid_from', { ascending: false })
      .limit(3)
    if (mounted.current) { setHistory(data ?? []); setHistLoading(false) }
  }

  async function saveEdit() {
    if (!editRow) return
    setSaving(true)
    const ops = []
    if (editName.trim() && editName.trim() !== editRow.name) {
      ops.push(supabase.from('raw_materials').update({ name: editName.trim() }).eq('id', editRow.id))
    }
    const priceVal = parseFloat(editPrice.replace(',', '.'))
    if (!isNaN(priceVal) && priceVal > 0) {
      ops.push(supabase.from('material_prices').insert({
        material_id:    editRow.id,
        price_per_unit: priceVal,
        valid_from:     new Date().toISOString().slice(0, 10),
      }))
    }
    await Promise.all(ops)
    await loadRows()
    if (mounted.current) { setSaving(false); setEditRow(null) }
  }

  async function deleteRow(id) {
    await supabase.from('raw_materials').delete().eq('id', id)
    setConfirmId(null)
    setOpenMenuId(null)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function fmt(val) {
    if (val == null) return '—'
    return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ru-RU')
  }

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

      <div className="flex gap-6">
        {/* Таблица */}
        <div className="flex-1 card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-forest">
              <tr className="text-left">
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Ед.</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Цена без НДС, руб.</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Дата цены</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-muted text-sm text-center font-body">Ничего не найдено</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className={`table-row ${editRow?.id === r.id ? 'bg-gold/5' : ''}`}>
                  <td className="p-4">
                    <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">
                      {r.article}
                    </span>
                  </td>
                  <td className="p-4 text-cream text-sm font-body">{r.name}</td>
                  <td className="p-4 text-muted text-sm font-mono">{r.unit}</td>
                  <td className="p-4 text-right font-mono text-sm text-gold">{fmt(r.current_price)}</td>
                  <td className="p-4 text-right font-mono text-xs text-muted">{fmtDate(r.price_date)}</td>

                  {/* Три точки + выпадающее меню */}
                  <td className="p-2 text-right" ref={openMenuId === r.id ? menuRef : null}>
                    <div className="relative inline-block">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                        className="p-1.5 rounded-md text-muted hover:text-cream hover:bg-forest-light/50 transition-colors"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {openMenuId === r.id && (
                        <div className="absolute right-0 top-8 z-50 w-40 bg-forest border border-forest-light/50
                                        rounded-lg shadow-lg overflow-hidden">
                          <button
                            onClick={() => openEdit(r)}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-body
                                       text-cream hover:bg-forest-light/50 transition-colors text-left"
                          >
                            <Pencil size={13} className="text-muted" />
                            Изменить
                          </button>
                          {confirmId === r.id ? (
                            <div className="px-4 py-2.5 border-t border-forest-light/30">
                              <p className="text-xs text-muted font-body mb-2">Удалить позицию?</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => deleteRow(r.id)}
                                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                  <Check size={12} /> Да
                                </button>
                                <button
                                  onClick={() => { setConfirmId(null); setOpenMenuId(null) }}
                                  className="flex items-center gap-1 text-xs text-muted hover:text-cream transition-colors"
                                >
                                  <X size={12} /> Нет
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmId(r.id)}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-body
                                         text-red-400 hover:bg-red-400/10 transition-colors text-left
                                         border-t border-forest-light/30"
                            >
                              <Trash2 size={13} />
                              Удалить
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Панель редактирования */}
        {editRow && (
          <div className="w-80 flex-shrink-0 card">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-sm font-semibold text-cream">Изменить позицию</h3>
              <button onClick={() => setEditRow(null)} className="text-muted hover:text-cream transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="mb-4">
              <div className="text-muted text-xs font-body mb-1">Артикул</div>
              <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">
                {editRow.article}
              </span>
            </div>

            <div className="mb-4">
              <label className="text-muted text-xs font-body block mb-1">Название</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                           text-cream text-sm font-body focus:outline-none focus:border-gold/50"
              />
            </div>

            <div className="mb-5">
              <label className="text-muted text-xs font-body block mb-1">
                Новая цена без НДС, руб.
                <span className="text-muted/50 ml-1">(пусто — не менять)</span>
              </label>
              <input
                value={editPrice}
                onChange={e => setEditPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                           text-cream text-sm font-mono focus:outline-none focus:border-gold/50"
              />
            </div>

            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={13} className="text-muted" />
                <span className="text-muted text-xs font-body uppercase tracking-widest">
                  История цен — последние 3 даты
                </span>
              </div>
              {histLoading ? (
                <p className="text-muted text-xs font-mono animate-pulse">Загрузка...</p>
              ) : history.length === 0 ? (
                <p className="text-muted text-xs font-body">Цен не найдено</p>
              ) : history.map((h, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-forest-light/30">
                  <span className="text-muted text-xs font-mono">{fmtDate(h.valid_from)}</span>
                  <span className={`font-mono text-xs ${i === 0 ? 'text-gold font-semibold' : 'text-muted'}`}>
                    {fmt(h.price_per_unit)} руб.
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={saveEdit}
              disabled={saving}
              className="w-full py-2 rounded-lg bg-gold/15 text-gold border border-gold/20
                         text-sm font-body hover:bg-gold/25 transition-all disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
