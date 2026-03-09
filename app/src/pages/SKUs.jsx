import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search, Filter, X, Upload, ImageOff } from 'lucide-react'

export default function SKUs() {
  const [rows, setRows]           = useState([])
  const [types, setTypes]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected]   = useState(null)
  const [components, setComponents] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

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
      supabase.from('products').select('id, type_id, photo_url'),
    ]).then(([skus, typeRes, products]) => {
      const prodMap = Object.fromEntries(
        (products.data ?? []).map(p => [p.id, { type_id: p.type_id, photo_url: p.photo_url }])
      )
      const enriched = (skus.data ?? []).map(s => ({
        ...s,
        type_id:   prodMap[s.product_id]?.type_id,
        photo_url: prodMap[s.product_id]?.photo_url,
      }))
      setRows(enriched)
      setTypes(typeRes.data ?? [])
      setLoading(false)
    })
  }, [])

  async function openSKU(row) {
    if (selected?.sku_article === row.sku_article) {
      setSelected(null); setComponents([]); return
    }
    setSelected(row)
    setLoadingDetail(true)
    const { data } = await supabase
      .from('sku_recipe_components')
      .select('quantity, unit, recipes(article, name), raw_materials(article, name)')
      .eq('product_id', row.product_id)
    setComponents(data ?? [])
    setLoadingDetail(false)
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    setUploading(true)

    const ext  = file.name.split('.').pop()
    const path = `${selected.sku_article}.${ext}`

    // Удаляем старое фото если есть
    await supabase.storage.from('sku-photos').remove([path])

    const { error: upErr } = await supabase.storage
      .from('sku-photos')
      .upload(path, file, { upsert: true })

    if (!upErr) {
      const { data: { publicUrl } } = supabase.storage
        .from('sku-photos')
        .getPublicUrl(path)

      await supabase
        .from('products')
        .update({ photo_url: publicUrl })
        .eq('id', selected.product_id)

      // Обновляем локальное состояние
      const updated = { ...selected, photo_url: publicUrl }
      setSelected(updated)
      setRows(prev => prev.map(r =>
        r.product_id === selected.product_id ? { ...r, photo_url: publicUrl } : r
      ))
    }
    setUploading(false)
    e.target.value = ''
  }

  async function removePhoto() {
    if (!selected?.photo_url) return
    const path = selected.photo_url.split('/').pop()
    await supabase.storage.from('sku-photos').remove([path])
    await supabase.from('products').update({ photo_url: null }).eq('id', selected.product_id)
    const updated = { ...selected, photo_url: null }
    setSelected(updated)
    setRows(prev => prev.map(r =>
      r.product_id === selected.product_id ? { ...r, photo_url: null } : r
    ))
  }

  const leafTypes = types.filter(t =>
    t.code.split('.').length === 3 || ['1.4','1.5','2.1','3'].includes(t.code)
  )

  const filtered = rows.filter(r => {
    const matchSearch =
      r.sku_article.toLowerCase().includes(search.toLowerCase()) ||
      r.product_name.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || String(r.type_id) === String(typeFilter)
    return matchSearch && matchType
  })

  const blendItems = components.filter(c => c.recipes)
  const packItems  = components.filter(c => c.raw_materials)

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

      <div className="flex gap-6">
        {/* Table */}
        <div className="flex-1 card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-forest">
              <tr className="text-left">
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body w-8"></th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Купаж</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Упаковка</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Итого, руб</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-muted text-sm text-center font-body">Ничего не найдено</td></tr>
              ) : filtered.map(r => (
                <tr
                  key={r.sku_article}
                  className={`table-row cursor-pointer ${selected?.sku_article === r.sku_article ? 'bg-gold/10' : ''}`}
                  onClick={() => openSKU(r)}
                >
                  {/* Миниатюра */}
                  <td className="pl-4 py-2">
                    {r.photo_url
                      ? <img src={r.photo_url} alt="" className="w-8 h-8 rounded object-cover border border-forest-light/40" />
                      : <div className="w-8 h-8 rounded bg-forest-light/30 flex items-center justify-center">
                          <ImageOff size={12} className="text-muted/40" />
                        </div>
                    }
                  </td>
                  <td className="p-4">
                    <span className="badge bg-forest-light text-cream border border-forest-light font-mono">
                      {r.sku_article}
                    </span>
                  </td>
                  <td className="p-4 text-cream text-sm font-body">{r.product_name}</td>
                  <td className="p-4 text-right font-mono text-sm text-muted">{Number(r.blend_cost).toFixed(2)}</td>
                  <td className="p-4 text-right font-mono text-sm text-muted">{Number(r.packaging_cost).toFixed(2)}</td>
                  <td className="p-4 text-right font-mono text-sm font-semibold text-gold">{Number(r.total_sku_cost).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 flex-shrink-0 card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-cream">Состав SKU</h3>
                <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs mt-1 inline-block">
                  {selected.sku_article}
                </span>
              </div>
              <button onClick={() => { setSelected(null); setComponents([]) }} className="text-muted hover:text-cream transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Фото */}
            <div className="mb-5">
              {selected.photo_url ? (
                <div className="relative group">
                  <img
                    src={selected.photo_url}
                    alt={selected.product_name}
                    className="w-full h-44 object-cover rounded-lg border border-forest-light/40"
                  />
                  <div className="absolute inset-0 bg-forest-dark/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-3">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="btn-primary text-xs flex items-center gap-1.5"
                    >
                      <Upload size={12} /> Заменить
                    </button>
                    <button
                      onClick={removePhoto}
                      className="bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded-lg hover:bg-red-800 transition-colors flex items-center gap-1.5"
                    >
                      <X size={12} /> Удалить
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-32 rounded-lg border-2 border-dashed border-forest-light/50
                             flex flex-col items-center justify-center gap-2
                             hover:border-gold/40 hover:bg-gold/5 transition-all text-muted hover:text-cream"
                >
                  {uploading
                    ? <span className="text-xs font-mono animate-pulse">Загрузка...</span>
                    : <>
                        <Upload size={18} />
                        <span className="text-xs font-body">Добавить фото</span>
                      </>
                  }
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={uploadPhoto}
              />
            </div>

            {loadingDetail ? (
              <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
            ) : (
              <>
                {blendItems.length > 0 && (
                  <div className="mb-4">
                    <div className="text-muted text-xs uppercase tracking-widest font-body mb-2">Купаж</div>
                    <div className="space-y-1">
                      {blendItems.map((c, i) => (
                        <div key={i} className="flex justify-between items-center py-1.5 border-b border-forest-light/30">
                          <div>
                            <div className="text-cream text-xs font-body">{c.recipes.name}</div>
                            <div className="text-muted text-xs font-mono">{c.recipes.article}</div>
                          </div>
                          <div className="text-gold font-mono text-xs ml-4 whitespace-nowrap">{c.quantity} {c.unit}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {packItems.length > 0 && (
                  <div>
                    <div className="text-muted text-xs uppercase tracking-widest font-body mb-2">Упаковка</div>
                    <div className="space-y-1">
                      {packItems.map((c, i) => (
                        <div key={i} className="flex justify-between items-center py-1.5 border-b border-forest-light/30">
                          <div>
                            <div className="text-cream text-xs font-body">{c.raw_materials.name}</div>
                            <div className="text-muted text-xs font-mono">{c.raw_materials.article}</div>
                          </div>
                          <div className="text-gold font-mono text-xs ml-4 whitespace-nowrap">{c.quantity} {c.unit}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-forest-light/40 flex justify-between items-center">
                  <span className="text-muted text-xs font-body uppercase tracking-widest">Себестоимость</span>
                  <span className="text-gold font-mono font-semibold">{Number(selected.total_sku_cost).toFixed(2)} руб</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
