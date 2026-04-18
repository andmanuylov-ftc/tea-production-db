import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { ChevronDown, ChevronRight, FileText, Search, X } from 'lucide-react'

const VAT = 0.22

export default function PriceLists() {
  const [lists, setLists]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [openId, setOpenId]             = useState(null)
  const [items, setItems]               = useState({})
  const [loadingItems, setLoadingItems] = useState({})
  const [search, setSearch]             = useState('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    supabase
      .from('price_lists')
      .select('id, name, markup_percent')
      .order('name')
      .then(({ data }) => {
        if (!mounted.current) return
        setLists(data ?? [])
        setLoading(false)
        // НЕ открываем автоматически — пользователь кликает сам
      })
    return () => { mounted.current = false }
  }, [])

  async function loadItems(id) {
    if (items[id] || loadingItems[id]) return
    if (!mounted.current) return

    setLoadingItems(prev => ({ ...prev, [id]: true }))

    // Один запрос к product_pricing — всё необходимое уже в нём
    const { data, error } = await supabase
      .from('product_pricing')
      .select('sku_article, product_name, package_size, package_unit, total_sku_cost, final_price')
      .eq('price_list_id', id)
      .order('sku_article')

    if (!mounted.current) return

    if (!error) {
      setItems(prev => ({ ...prev, [id]: data ?? [] }))
    }
    setLoadingItems(prev => ({ ...prev, [id]: false }))
  }

  function toggleList(id) {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id)
    loadItems(id)
  }

  function fmt(val) {
    if (val == null) return '—'
    return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function filteredRows(listItems) {
    if (!search.trim()) return listItems
    const q = search.toLowerCase()
    return listItems.filter(i =>
      (i.sku_article ?? '').toLowerCase().includes(q) ||
      (i.product_name ?? '').toLowerCase().includes(q)
    )
  }

  function highlight(text) {
    if (!search.trim() || !text) return text
    const q = search.trim()
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-gold/30 text-cream rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div className="p-8">
      <PageHeader
        title="ПРАЙС ЛИСТ"
        subtitle="Цены без НДС и с НДС (22%)"
        action={
          <div className="flex items-center gap-2 text-muted text-xs font-body">
            <FileText size={14} />
            {lists.length} прайс-лист{lists.length !== 1 ? 'а' : ''}
          </div>
        }
      />

      {loading ? (
        <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
      ) : lists.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-muted text-sm font-body">Прайс-листов пока нет</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {lists.map(l => (
            <div key={l.id} className="card overflow-hidden">

              {/* Заголовок — кликать для раскрытия */}
              <button
                onClick={() => toggleList(l.id)}
                className="w-full flex items-center justify-between py-1 hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-3">
                  {openId === l.id
                    ? <ChevronDown size={16} className="text-gold" />
                    : <ChevronRight size={16} className="text-muted" />}
                  <span className="text-cream font-body font-medium text-base">{l.name}</span>
                  <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs px-2 py-0.5 rounded">
                    +{l.markup_percent}%
                  </span>
                </div>
                <div className="text-muted text-xs font-mono">
                  {items[l.id] ? `${items[l.id].length} позиций` : 'нажмите для загрузки'}
                </div>
              </button>

              {/* Поиск + таблица */}
              {openId === l.id && (
                <div className="mt-4">
                  <div className="relative mb-4 max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Поиск по артикулу или названию…"
                      className="w-full bg-forest-dark border border-forest-light/40 rounded-lg pl-9 pr-8 py-2
                                 text-cream text-sm font-body focus:outline-none focus:border-gold/50 placeholder:text-muted"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-cream transition-colors"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="-mx-6 overflow-x-auto">
                    {loadingItems[l.id] ? (
                      <div className="px-6 pb-4 text-muted text-sm font-mono animate-pulse">Загрузка позиций...</div>
                    ) : (() => {
                      const rows = filteredRows(items[l.id] ?? [])
                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-t border-forest-light/20">
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-6 py-3 w-8">#</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Артикул</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Наименование</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3">Фасовка</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3">Себест., руб</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3 text-gold">Цена без НДС, руб</th>
                              <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-6 py-3 text-gold/70">Цена с НДС 22%, руб</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-6 py-8 text-center text-muted text-sm font-body">
                                  {search ? `Ничего не найдено по запросу «${search}»` : 'Нет данных'}
                                </td>
                              </tr>
                            ) : rows.map((item, idx) => {
                              const priceNoVat = Number(item.final_price) || 0
                              const priceVat   = priceNoVat * (1 + VAT)
                              return (
                                <tr
                                  key={item.sku_article}
                                  className={`border-t border-forest-light/10 hover:bg-forest-light/5 transition-colors ${idx % 2 !== 0 ? 'bg-forest-light/5' : ''}`}
                                >
                                  <td className="px-6 py-2.5 text-muted font-mono text-xs text-right">{idx + 1}</td>
                                  <td className="px-4 py-2.5">
                                    <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap">
                                      {highlight(item.sku_article ?? '—')}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-cream font-body">
                                    {highlight(item.product_name ?? '—')}
                                  </td>
                                  <td className="px-4 py-2.5 text-muted font-mono text-right whitespace-nowrap">
                                    {item.package_size ? `${item.package_size} ${item.package_unit}` : '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-cream font-mono text-right">
                                    {fmt(item.total_sku_cost)}
                                  </td>
                                  <td className="px-4 py-2.5 text-gold font-mono text-right font-medium">
                                    {fmt(priceNoVat)}
                                  </td>
                                  <td className="px-6 py-2.5 text-gold/70 font-mono text-right">
                                    {fmt(priceVat)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
