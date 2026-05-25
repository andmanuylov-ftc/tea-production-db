import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { Search, Filter, X, Upload, ImageOff, MoreHorizontal, Pencil, Trash2, Download, Plus, Layers } from 'lucide-react'

const UNITS = ['кг', 'шт', 'г', 'рул', 'погм', 'мл']
const fmtCost = v => (v == null || !isFinite(v)) ? '—' : `${Number(v).toFixed(2)} руб`

// Поисковый combobox для рецептов / материалов (списки на сотни позиций)
function Combo({ items, value, onChange, placeholder, getLabel, getSub }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const sel = items.find(i => i.id === value)
  const ql = q.trim().toLowerCase()
  const filtered = (ql
    ? items.filter(i => `${getLabel(i)} ${i.article ?? ''}`.toLowerCase().includes(ql))
    : items
  ).slice(0, 50)
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                   text-sm focus:outline-none focus:border-gold/50 truncate"
      >
        {sel
          ? <span className="text-cream font-body">{getLabel(sel)} <span className="text-muted font-mono text-xs">{sel.article}</span></span>
          : <span className="text-muted font-body">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-[60] mt-1 w-full bg-forest-dark border border-forest-light/50 rounded-lg shadow-2xl">
          <div className="p-2 border-b border-forest-light/30">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Поиск…"
              className="w-full bg-forest border border-forest-light/40 rounded px-2 py-1.5
                         text-cream text-sm font-body focus:outline-none focus:border-gold/50"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0
              ? <div className="px-3 py-2 text-muted text-xs font-body">Ничего не найдено</div>
              : filtered.map(i => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => { onChange(i.id); setOpen(false); setQ('') }}
                  className={`w-full text-left px-3 py-2 hover:bg-forest-light/40 transition-colors ${i.id === value ? 'bg-gold/10' : ''}`}
                >
                  <div className="text-cream text-sm font-body truncate">{getLabel(i)}</div>
                  <div className="text-muted text-xs font-mono">{i.article}{getSub ? ` · ${getSub(i)}` : ''}</div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SKUs() {
  const [searchParams] = useSearchParams()
  const [rows, setRows]             = useState([])
  const [types, setTypes]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected]     = useState(null)
  const [components, setComponents] = useState([])
  const [costs, setCosts]           = useState({})
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [uploading, setUploading]   = useState(false)
  const fileRef = useRef(null)

  // export menu
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef(null)

  // menu / edit / delete
  const [openMenu,  setOpenMenu]  = useState(null)
  const [editSku,   setEditSku]   = useState(null)
  const [editForm,  setEditForm]  = useState({})
  const [deleteSku, setDeleteSku] = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)

  // редактор состава и комплекта
  const [editComp,   setEditComp]   = useState(null)   // строка SKU, чей состав правим
  const [compBlend,  setCompBlend]  = useState(null)   // { recipe_id, quantity, unit }
  const [compPacks,  setCompPacks]  = useState([])     // [{ material_id, quantity, unit }]
  const [compSaving, setCompSaving] = useState(false)
  const [compError,  setCompError]  = useState(null)

  // справочники для пикеров (ленивая загрузка один раз)
  const [allRecipes,   setAllRecipes]   = useState(null) // [{ id, article, name, cost_per_kg }]
  const [allMaterials, setAllMaterials] = useState(null) // [{ id, article, name, unit, price }]
  const [refLoading,   setRefLoading]   = useState(false)

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
      supabase.from('products').select('id, type_id, photo_url, article, name'),
    ]).then(([skus, typeRes, products]) => {
      const prodMap = Object.fromEntries(
        (products.data ?? []).map(p => [p.id, { type_id: p.type_id, photo_url: p.photo_url, article: p.article, name: p.name }])
      )
      const enriched = (skus.data ?? []).map(s => ({
        ...s,
        type_id:   prodMap[s.product_id]?.type_id,
        photo_url: prodMap[s.product_id]?.photo_url,
        _article:  prodMap[s.product_id]?.article,
        _name:     prodMap[s.product_id]?.name,
      }))
      setRows(enriched)
      setTypes(typeRes.data ?? [])
      setLoading(false)
    })
  }, [])

  // Предзаполнение поиска из URL ?q=
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setSearch(q)
  }, [searchParams])

  // закрыть меню экспорта при клике вне
  useEffect(() => {
    function handle(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ───── Экспорт в Excel ─────
  function exportToExcel(markupPercent) {
    const typeMap = Object.fromEntries(types.map(t => [t.id, t]))
    const factor  = 1 + markupPercent / 100

    const data = filtered.map(r => {
      const type = typeMap[r.type_id]
      return {
        'Артикул':              r.sku_article,
        'Название':             r._name ?? r.product_name,
        'Код категории':       type?.code ?? '',
        'Категория':            type?.name ?? '',
        'Купаж, руб':           Number(r.blend_cost),
        'Упаковка, руб':       Number(r.packaging_cost),
        'Итого себест., руб': Number(r.total_sku_cost),
        [`Цена +${markupPercent}%, руб`]: Math.round(Number(r.total_sku_cost) * factor * 100) / 100,
      }
    })

    const ws = XLSX.utils.json_to_sheet(data)

    // Ширина колонок
    ws['!cols'] = [
      { wch: 14 },  // Артикул
      { wch: 50 },  // Название
      { wch: 8  },  // Код
      { wch: 28 },  // Категория
      { wch: 12 },  // Купаж
      { wch: 14 },  // Упаковка
      { wch: 18 },  // Итого
      { wch: 16 },  // Цена +N%
    ]

    // Числовой формат для колонок E-H (индекс 4..7)
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      for (let C = 4; C <= 7; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
        if (cell) cell.z = '#,##0.00'
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Себестоимость SKU')

    const today = new Date().toISOString().slice(0, 10)
    const filterSuffix = (search || typeFilter !== 'all') ? '_filtered' : ''
    XLSX.writeFile(wb, `SKU_себестоимость_plus${markupPercent}_${today}${filterSuffix}.xlsx`)

    setExportOpen(false)
  }

  async function loadComponents(productId) {
    setLoadingDetail(true)
    const { data: comps } = await supabase
      .from('sku_recipe_components')
      .select('quantity, unit, recipes(article, name), raw_materials(id, article, name)')
      .eq('product_id', productId)

    const items = comps ?? []
    setComponents(items)

    const recipeArticles = items.filter(c => c.recipes).map(c => c.recipes.article)
    const materialIds    = items.filter(c => c.raw_materials).map(c => c.raw_materials.id)

    const [recipeCosts, matPrices] = await Promise.all([
      recipeArticles.length
        ? supabase.from('recipe_cost').select('recipe_article, total_cost').in('recipe_article', recipeArticles)
        : { data: [] },
      materialIds.length
        ? supabase.from('material_prices')
            .select('material_id, price_per_unit')
            .in('material_id', materialIds)
            .is('valid_to', null)
        : { data: [] },
    ])

    const costMap = {}
    for (const r of (recipeCosts.data ?? [])) costMap[r.recipe_article] = Number(r.total_cost)
    for (const m of (matPrices.data ?? []))   costMap[m.material_id]    = Number(m.price_per_unit)
    setCosts(costMap)
    setLoadingDetail(false)
  }

  async function openSKU(row) {
    if (selected?.sku_article === row.sku_article) {
      setSelected(null); setComponents([]); setCosts({}); return
    }
    setSelected(row)
    await loadComponents(row.product_id)
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `${selected.sku_article}.${ext}`
    await supabase.storage.from('sku-photos').remove([path])
    const { error: upErr } = await supabase.storage.from('sku-photos').upload(path, file, { upsert: true })
    if (!upErr) {
      const { data: { publicUrl } } = supabase.storage.from('sku-photos').getPublicUrl(path)
      await supabase.from('products').update({ photo_url: publicUrl }).eq('id', selected.product_id)
      const updated = { ...selected, photo_url: publicUrl }
      setSelected(updated)
      setRows(prev => prev.map(r => r.product_id === selected.product_id ? { ...r, photo_url: publicUrl } : r))
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
    setRows(prev => prev.map(r => r.product_id === selected.product_id ? { ...r, photo_url: null } : r))
  }

  function startEdit(row, e) {
    e.stopPropagation()
    setOpenMenu(null)
    setEditSku(row)
    setEditForm({ article: row._article ?? row.sku_article, name: row._name ?? row.product_name, type_id: row.type_id ?? '' })
  }

  async function saveEdit() {
    if (!editSku) return
    setSaving(true)
    const { error } = await supabase.from('products').update({
      article: editForm.article.trim(),
      name:    editForm.name.trim(),
      type_id: editForm.type_id || null,
    }).eq('id', editSku.product_id)
    if (!error) {
      setRows(prev => prev.map(r =>
        r.product_id === editSku.product_id
          ? { ...r, sku_article: editForm.article.trim(), product_name: editForm.name.trim(), type_id: editForm.type_id, _article: editForm.article.trim(), _name: editForm.name.trim() }
          : r
      ))
      if (selected?.product_id === editSku.product_id)
        setSelected(prev => ({ ...prev, sku_article: editForm.article.trim(), product_name: editForm.name.trim() }))
      setEditSku(null)
    }
    setSaving(false)
  }

  function startDelete(row, e) {
    e.stopPropagation()
    setOpenMenu(null)
    setDeleteSku(row)
  }

  async function confirmDelete() {
    if (!deleteSku) return
    setDeleting(true)
    await supabase.from('sku_recipe_components').delete().eq('product_id', deleteSku.product_id)
    await supabase.from('products').delete().eq('id', deleteSku.product_id)
    setRows(prev => prev.filter(r => r.product_id !== deleteSku.product_id))
    if (selected?.product_id === deleteSku.product_id) { setSelected(null); setComponents([]); setCosts({}) }
    setDeleteSku(null)
    setDeleting(false)
  }

  // ───── Редактор состава и комплекта ─────
  async function ensureRefData() {
    if (allRecipes && allMaterials) return
    setRefLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const [recRes, recCostRes, matRes, matPriceRes] = await Promise.all([
      supabase.from('recipes').select('id, article, name').eq('is_active', true).order('article'),
      supabase.from('recipe_cost').select('recipe_id, cost_per_kg'),
      supabase.from('raw_materials').select('id, article, name, unit').eq('is_active', true).order('article'),
      supabase.from('material_prices').select('material_id, price_per_unit, valid_from, valid_to'),
    ])

    const recCostMap = {}
    for (const r of (recCostRes.data ?? [])) recCostMap[r.recipe_id] = Number(r.cost_per_kg)

    // актуальная цена материала по логике view sku_cost: valid_from<=today, valid_to null|>=today, свежайшая
    const byMat = {}
    for (const p of (matPriceRes.data ?? [])) {
      if (p.valid_from && p.valid_from > today) continue
      if (p.valid_to && p.valid_to < today) continue
      const cur = byMat[p.material_id]
      if (!cur || (p.valid_from ?? '') > (cur.valid_from ?? '')) byMat[p.material_id] = p
    }

    setAllRecipes((recRes.data ?? []).map(r => ({ ...r, cost_per_kg: recCostMap[r.id] ?? null })))
    setAllMaterials((matRes.data ?? []).map(m => ({ ...m, price: byMat[m.id] ? Number(byMat[m.id].price_per_unit) : null })))
    setRefLoading(false)
  }

  async function startEditComponents(row, e) {
    if (e) e.stopPropagation()
    setOpenMenu(null)
    setCompError(null)
    setEditComp(row)
    await ensureRefData()
    const { data: comps } = await supabase
      .from('sku_recipe_components')
      .select('recipe_id, material_id, quantity, unit')
      .eq('product_id', row.product_id)
    const blend = (comps ?? []).find(c => c.recipe_id)
    const packs = (comps ?? []).filter(c => c.material_id)
    setCompBlend(blend
      ? { recipe_id: blend.recipe_id, quantity: String(blend.quantity), unit: blend.unit }
      : { recipe_id: '', quantity: '0.5', unit: 'кг' })
    setCompPacks(packs.map(p => ({ material_id: p.material_id, quantity: String(p.quantity), unit: p.unit })))
  }

  async function saveComponents() {
    if (!editComp) return
    setCompError(null)
    // валидация
    if (!compBlend?.recipe_id) { setCompError('Выберите рецепт купажа'); return }
    const bq = Number(compBlend.quantity)
    if (!isFinite(bq) || bq <= 0) { setCompError('Количество купажа должно быть больше 0'); return }
    for (const p of compPacks) {
      if (!p.material_id) { setCompError('У каждой строки упаковки должен быть выбран материал'); return }
      const q = Number(p.quantity)
      if (!isFinite(q) || q <= 0) { setCompError('Количество упаковки должно быть больше 0'); return }
    }

    setCompSaving(true)
    const productId = editComp.product_id
    const newRows = [
      { product_id: productId, recipe_id: compBlend.recipe_id, material_id: null, quantity: bq, unit: compBlend.unit },
      ...compPacks.map(p => ({ product_id: productId, recipe_id: null, material_id: p.material_id, quantity: Number(p.quantity), unit: p.unit })),
    ]

    const { error: delErr } = await supabase.from('sku_recipe_components').delete().eq('product_id', productId)
    if (delErr) { setCompError(`Ошибка удаления старого состава: ${delErr.message}`); setCompSaving(false); return }
    const { error: insErr } = await supabase.from('sku_recipe_components').insert(newRows)
    if (insErr) { setCompError(`Ошибка записи состава: ${insErr.message}`); setCompSaving(false); return }
    // держим products.recipe_id в синхроне с купажом
    await supabase.from('products').update({ recipe_id: compBlend.recipe_id }).eq('id', productId)

    // перечитываем себестоимость из view
    const { data: costRow } = await supabase
      .from('sku_cost')
      .select('blend_cost, packaging_cost, total_sku_cost')
      .eq('product_id', productId)
      .single()
    if (costRow) {
      setRows(prev => prev.map(r => r.product_id === productId
        ? { ...r, blend_cost: costRow.blend_cost, packaging_cost: costRow.packaging_cost, total_sku_cost: costRow.total_sku_cost }
        : r))
      if (selected?.product_id === productId)
        setSelected(prev => ({ ...prev, blend_cost: costRow.blend_cost, packaging_cost: costRow.packaging_cost, total_sku_cost: costRow.total_sku_cost }))
    }
    // если SKU открыт в правой панели — обновляем её
    if (selected?.product_id === productId) await loadComponents(productId)

    setCompSaving(false)
    setEditComp(null)
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

  function lineItemCost(c) {
    if (c.recipes) {
      const pricePerKg = costs[c.recipes.article]
      return pricePerKg != null ? (pricePerKg * Number(c.quantity)).toFixed(2) : null
    } else {
      const pricePerUnit = costs[c.raw_materials.id]
      return pricePerUnit != null ? (pricePerUnit * Number(c.quantity)).toFixed(2) : null
    }
  }

  // предпросмотр себестоимости в редакторе состава
  const prevBlend = (() => {
    if (!compBlend?.recipe_id) return null
    const r = (allRecipes ?? []).find(x => x.id === compBlend.recipe_id)
    const q = Number(compBlend.quantity)
    if (!r || r.cost_per_kg == null || !isFinite(q)) return null
    return r.cost_per_kg * q
  })()
  const prevPack = compPacks.reduce((sum, p) => {
    const m = (allMaterials ?? []).find(x => x.id === p.material_id)
    const q = Number(p.quantity)
    if (!m || m.price == null || !isFinite(q)) return sum
    return sum + m.price * q
  }, 0)
  const prevTotal = (prevBlend ?? 0) + prevPack

  return (
    <div className="p-8">
      <PageHeader
        title="SKU"
        subtitle={`${rows.length} позиций`}
        action={
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/15 text-gold
                         border border-gold/20 text-sm font-body hover:bg-gold/25 transition-all"
            >
              <Download size={14} />
              Экспорт в Excel
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-11 z-50 w-56 bg-forest border border-forest-light/50
                              rounded-lg shadow-2xl overflow-hidden">
                <div className="px-4 py-2 text-xs text-muted font-body border-b border-forest-light/30">
                  С наценкой к себестоимости
                </div>
                {[40, 50, 100].map(p => (
                  <button
                    key={p}
                    onClick={() => exportToExcel(p)}
                    className="w-full flex justify-between items-center px-4 py-2.5 text-sm font-body
                               text-cream hover:bg-forest-light/50 transition-colors text-left"
                  >
                    <span>+{p}%</span>
                    <span className="text-muted text-xs font-mono">{filtered.length} SKU</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

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

      {openMenu && <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />}

      <div className="flex gap-6">
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
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-muted text-sm text-center font-body">Ничего не найдено</td></tr>
              ) : filtered.map(r => (
                <tr
                  key={r.sku_article}
                  className={`table-row cursor-pointer ${selected?.sku_article === r.sku_article ? 'bg-gold/10' : ''}`}
                  onClick={() => openSKU(r)}
                >
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
                  <td className="pr-3 text-right relative" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenMenu(openMenu === r.sku_article ? null : r.sku_article)}
                      className="text-muted hover:text-cream p-1.5 rounded hover:bg-forest-light/30 transition-colors"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {openMenu === r.sku_article && (
                      <div className="absolute right-3 top-9 z-50 bg-forest-dark border border-forest-light/50 rounded-lg shadow-2xl py-1 w-40">
                        <button
                          onClick={e => startEdit(r, e)}
                          className="w-full text-left px-4 py-2 text-sm text-cream hover:bg-forest-light/30 font-body flex items-center gap-2"
                        >
                          <Pencil size={13} /> Редактировать
                        </button>
                        <button
                          onClick={e => startEditComponents(r, e)}
                          className="w-full text-left px-4 py-2 text-sm text-cream hover:bg-forest-light/30 font-body flex items-center gap-2"
                        >
                          <Layers size={13} /> Состав и комплект
                        </button>
                        <button
                          onClick={e => startDelete(r, e)}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 font-body flex items-center gap-2"
                        >
                          <Trash2 size={13} /> Удалить
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="w-80 flex-shrink-0 card overflow-y-auto max-h-[calc(100vh-10rem)]">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-cream">Состав SKU</h3>
                <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs mt-1 inline-block">
                  {selected.sku_article}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEditComponents(selected)}
                  title="Изменить состав и комплект"
                  className="text-muted hover:text-gold transition-colors p-1"
                >
                  <Pencil size={14} />
                </button>
                <button onClick={() => { setSelected(null); setComponents([]); setCosts({}) }} className="text-muted hover:text-cream transition-colors p-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="mb-5">
              {selected.photo_url ? (
                <div className="relative group">
                  <img
                    src={selected.photo_url}
                    alt={selected.product_name}
                    className="w-full h-44 object-cover rounded-lg border border-forest-light/40"
                  />
                  <div className="absolute inset-0 bg-forest-dark/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-3">
                    <button onClick={() => fileRef.current?.click()} className="btn-primary text-xs flex items-center gap-1.5">
                      <Upload size={12} /> Заменить
                    </button>
                    <button onClick={removePhoto} className="bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded-lg hover:bg-red-800 transition-colors flex items-center gap-1.5">
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
                    : <><Upload size={18} /><span className="text-xs font-body">Добавить фото</span></>
                  }
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
            </div>

            {loadingDetail ? (
              <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
            ) : (
              <>
                {blendItems.length > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-muted text-xs uppercase tracking-widest font-body">Купаж</span>
                      <span className="text-muted text-xs font-mono">{Number(selected.blend_cost).toFixed(2)} руб</span>
                    </div>
                    <div className="space-y-1">
                      {blendItems.map((c, i) => {
                        const cost = lineItemCost(c)
                        return (
                          <div key={i} className="py-1.5 border-b border-forest-light/30">
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="text-cream text-xs font-body truncate">{c.recipes.name}</div>
                                <div className="text-muted text-xs font-mono">{c.recipes.article}</div>
                              </div>
                              <div className="text-right whitespace-nowrap">
                                <div className="text-muted font-mono text-xs">{c.quantity} {c.unit}</div>
                                {cost && <div className="text-gold font-mono text-xs">{cost} руб</div>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {packItems.length > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-muted text-xs uppercase tracking-widest font-body">Упаковка</span>
                      <span className="text-muted text-xs font-mono">{Number(selected.packaging_cost).toFixed(2)} руб</span>
                    </div>
                    <div className="space-y-1">
                      {packItems.map((c, i) => {
                        const cost = lineItemCost(c)
                        return (
                          <div key={i} className="py-1.5 border-b border-forest-light/30">
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="text-cream text-xs font-body">{c.raw_materials.name}</div>
                                <div className="text-muted text-xs font-mono">{c.raw_materials.article}</div>
                              </div>
                              <div className="text-right whitespace-nowrap">
                                <div className="text-muted font-mono text-xs">{c.quantity} {c.unit}</div>
                                {cost && <div className="text-gold font-mono text-xs">{cost} руб</div>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
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

      {editSku && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/80 backdrop-blur-sm">
          <div className="bg-forest border border-forest-light/40 rounded-xl p-6 w-[420px] shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg text-cream">Редактировать SKU</h3>
              <button onClick={() => setEditSku(null)} className="text-muted hover:text-cream"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Артикул</label>
                <input
                  value={editForm.article}
                  onChange={e => setEditForm(f => ({ ...f, article: e.target.value }))}
                  className="w-full bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-mono focus:outline-none focus:border-gold/50"
                />
              </div>
              <div>
                <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Название</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-body focus:outline-none focus:border-gold/50"
                />
              </div>
              <div>
                <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Категория</label>
                <select
                  value={editForm.type_id}
                  onChange={e => setEditForm(f => ({ ...f, type_id: e.target.value }))}
                  className="w-full bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-body focus:outline-none focus:border-gold/50 appearance-none"
                >
                  <option value="">— не указана —</option>
                  {types.map(t => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setEditSku(null)} className="px-4 py-2 text-sm text-muted hover:text-cream font-body transition-colors">Отмена</button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editComp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/80 backdrop-blur-sm p-4">
          <div className="bg-forest border border-forest-light/40 rounded-xl p-6 w-[600px] max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-lg text-cream">Состав и комплект</h3>
              <button onClick={() => setEditComp(null)} className="text-muted hover:text-cream"><X size={16} /></button>
            </div>
            <div className="mb-5">
              <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs">{editComp.sku_article}</span>
              <span className="text-cream text-sm font-body ml-2">{editComp._name ?? editComp.product_name}</span>
            </div>

            {refLoading && !allRecipes ? (
              <div className="text-muted text-sm font-mono animate-pulse py-8 text-center">Загрузка справочников…</div>
            ) : (
              <>
                {/* Купаж */}
                <div className="mb-5">
                  <div className="text-muted text-xs uppercase tracking-widest font-body mb-2">Купаж (рецепт)</div>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <Combo
                        items={allRecipes ?? []}
                        value={compBlend?.recipe_id ?? ''}
                        onChange={id => setCompBlend(b => ({ ...b, recipe_id: id }))}
                        placeholder="Выберите рецепт…"
                        getLabel={r => r.name}
                        getSub={r => r.cost_per_kg != null ? `${Number(r.cost_per_kg).toFixed(2)} ₽/кг` : 'нет цены'}
                      />
                    </div>
                    <input
                      value={compBlend?.quantity ?? ''}
                      onChange={e => setCompBlend(b => ({ ...b, quantity: e.target.value }))}
                      className="w-24 bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                                 text-cream text-sm font-mono text-right focus:outline-none focus:border-gold/50"
                    />
                    <select
                      value={compBlend?.unit ?? 'кг'}
                      onChange={e => setCompBlend(b => ({ ...b, unit: e.target.value }))}
                      className="w-20 bg-forest-dark border border-forest-light/40 rounded-lg px-2 py-2
                                 text-cream text-sm font-body focus:outline-none focus:border-gold/50 appearance-none"
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Упаковка */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted text-xs uppercase tracking-widest font-body">Упаковка (материалы)</span>
                    <button
                      type="button"
                      onClick={() => setCompPacks(p => [...p, { material_id: '', quantity: '1', unit: 'шт' }])}
                      className="text-gold text-xs font-body hover:text-gold/80 flex items-center gap-1"
                    >
                      <Plus size={12} /> Добавить материал
                    </button>
                  </div>
                  {compPacks.length === 0 ? (
                    <div className="text-muted/60 text-xs font-body py-2">Нет упаковки</div>
                  ) : (
                    <div className="space-y-2">
                      {compPacks.map((p, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <div className="flex-1 min-w-0">
                            <Combo
                              items={allMaterials ?? []}
                              value={p.material_id}
                              onChange={id => setCompPacks(arr => arr.map((x, i) => i === idx ? { ...x, material_id: id } : x))}
                              placeholder="Выберите материал…"
                              getLabel={m => m.name}
                              getSub={m => m.price != null ? `${Number(m.price).toFixed(2)} ₽/${m.unit}` : 'нет цены'}
                            />
                          </div>
                          <input
                            value={p.quantity}
                            onChange={e => setCompPacks(arr => arr.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))}
                            className="w-24 bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                                       text-cream text-sm font-mono text-right focus:outline-none focus:border-gold/50"
                          />
                          <select
                            value={p.unit}
                            onChange={e => setCompPacks(arr => arr.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
                            className="w-20 bg-forest-dark border border-forest-light/40 rounded-lg px-2 py-2
                                       text-cream text-sm font-body focus:outline-none focus:border-gold/50 appearance-none"
                          >
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => setCompPacks(arr => arr.filter((_, i) => i !== idx))}
                            className="text-muted hover:text-red-400 p-2"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Предпросмотр себестоимости */}
                <div className="bg-forest-dark/60 rounded-lg p-3 mb-4 space-y-1">
                  <div className="flex justify-between text-xs font-body">
                    <span className="text-muted">Купаж</span>
                    <span className="font-mono text-cream">{fmtCost(prevBlend)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-body">
                    <span className="text-muted">Упаковка</span>
                    <span className="font-mono text-cream">{fmtCost(prevPack)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-body pt-1 border-t border-forest-light/30">
                    <span className="text-muted uppercase tracking-widest text-xs">Итого</span>
                    <span className="font-mono text-gold font-semibold">{fmtCost(prevTotal)}</span>
                  </div>
                </div>

                {compError && <div className="text-red-400 text-xs font-body mb-3">{compError}</div>}

                <div className="flex gap-3 justify-end">
                  <button onClick={() => setEditComp(null)} className="px-4 py-2 text-sm text-muted hover:text-cream font-body transition-colors">Отмена</button>
                  <button onClick={saveComponents} disabled={compSaving} className="btn-primary text-sm disabled:opacity-50">
                    {compSaving ? 'Сохранение…' : 'Сохранить'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteSku && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/80 backdrop-blur-sm">
          <div className="bg-forest border border-forest-light/40 rounded-xl p-6 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-cream">Удалить SKU?</h3>
              <button onClick={() => setDeleteSku(null)} className="text-muted hover:text-cream"><X size={16} /></button>
            </div>
            <p className="text-muted text-sm font-body mb-1">
              Будет удалён SKU и все его компоненты:
            </p>
            <div className="bg-forest-dark rounded-lg p-3 mb-5">
              <span className="font-mono text-gold text-sm">{deleteSku.sku_article}</span>
              <span className="text-cream text-sm font-body ml-2">{deleteSku.product_name}</span>
            </div>
            <p className="text-red-400 text-xs font-body mb-5">Это действие необратимо.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteSku(null)} className="px-4 py-2 text-sm text-muted hover:text-cream font-body transition-colors">Отмена</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-red-800 hover:bg-red-700 text-red-100 text-sm px-4 py-2 rounded-lg font-body transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 size={13} />{deleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
