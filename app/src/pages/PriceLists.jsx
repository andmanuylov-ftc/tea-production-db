import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'

const VAT = 0.22

export default function PriceLists() {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [items, setItems] = useState({})
  const [loadingItems, setLoadingItems] = useState({})

  useEffect(() => {
    supabase
      .from('price_lists')
      .select('id, name, markup_percent')
      .order('name')
      .then(({ data }) => {
        setLists(data ?? [])
        setLoading(false)
        if (data && data.length === 1) loadItems(data[0].id)
      })
  }, [])

  async function loadItems(id) {
    if (items[id]) return
    setLoadingItems(prev => ({ ...prev, [id]: true }))

    const { data } = await supabase
      .from('price_list_items')
      .select(`id, price, products (id, article, name, package_size, package_unit)`)
      .eq('price_list_id', id)

    const productIds = (data ?? []).map(i => i.products?.id).filter(Boolean)
    let costMap = {}
    if (productIds.length > 0) {
      const { data: costs } = await supabase
        .from('sku_cost')
        .select('product_id, total_sku_cost')
        .in('product_id', productIds)
      ;(costs ?? []).forEach(c => { costMap[c.product_id] = c })
    }

    const enriched = (data ?? [])
      .map(i => ({ ...i, cost: costMap[i.products?.id] ?? null }))
      .sort((a, b) => (a.products?.article ?? '').localeCompare(b.products?.article ?? ''))

    setItems(prev => ({ ...prev, [id]: enriched }))
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

  return (
    <div className="p-8">
      <PageHeader
        title="Прайс-листы"
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

              {/* Заголовок */}
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
                  {items[l.id] ? `${items[l.id].length} позиций` : ''}
                </div>
              </button>

              {/* Таблица */}
              {openId === l.id && (
                <div className="mt-4 -mx-6 overflow-x-auto">
                  {loadingItems[l.id] ? (
                    <div className="px-6 pb-4 text-muted text-sm font-mono animate-pulse">Загрузка позиций...</div>
                  ) : (
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
                        {(items[l.id] ?? []).map((item, idx) => {
                          const priceNoVat = Number(item.price) || 0
                          const priceVat = priceNoVat * (1 + VAT)
                          return (
                            <tr
                              key={item.id}
                              className={`border-t border-forest-light/10 hover:bg-forest-light/5 transition-colors ${idx % 2 !== 0 ? 'bg-forest-light/5' : ''}`}
                            >
                              <td className="px-6 py-2.5 text-muted font-mono text-xs text-right">{idx + 1}</td>
                              <td className="px-4 py-2.5">
                                <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap">
                                  {item.products?.article ?? '—'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-cream font-body">{item.products?.name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-muted font-mono text-right whitespace-nowrap">
                                {item.products?.package_size ? `${item.products.package_size} ${item.products.package_unit}` : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-cream font-mono text-right">
                                {fmt(item.cost?.total_sku_cost)}
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

                      {/* Итого */}
                      {items[l.id]?.length > 0 && (() => {
                        const totalCost = items[l.id].reduce((s, i) => s + (Number(i.cost?.total_sku_cost) || 0), 0)
                        const totalNoVat = items[l.id].reduce((s, i) => s + (Number(i.price) || 0), 0)
                        const totalVat = totalNoVat * (1 + VAT)
                        return (
                          <tfoot>
                            <tr className="border-t-2 border-gold/30">
                              <td colSpan={4} className="px-6 py-3 text-muted text-xs font-body">
                                Итого: {items[l.id].length} позиций
                              </td>
                              <td className="px-4 py-3 text-cream font-mono text-right font-medium">{fmt(totalCost)}</td>
                              <td className="px-4 py-3 text-gold font-mono text-right font-medium">{fmt(totalNoVat)}</td>
                              <td className="px-6 py-3 text-gold/70 font-mono text-right font-medium">{fmt(totalVat)}</td>
                            </tr>
                          </tfoot>
                        )
                      })()}
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
