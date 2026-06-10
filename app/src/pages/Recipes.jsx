import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAssortment } from '../contexts/AssortmentContext'
import PageHeader from '../components/PageHeader'
import { Search, X, MoreHorizontal, Pencil, Trash2, Plus, FlaskConical, Download, Upload, Image as ImageIcon } from 'lucide-react'

const PHOTO_BUCKET = 'sku-photos'

// Достаёт путь объекта в бакете из публичного URL (для удаления старого файла)
function storagePathFromUrl(url) {
  if (!url) return null
  const marker = `/${PHOTO_BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

export default function Recipes() {
  const [searchParams] = useSearchParams()
  const { assortment } = useAssortment()
  const [allowedIds, setAllowedIds] = useState(null) // null = без фильтра (показать все)
  const [rows, setRows]         = useState([])
  const [photoMap, setPhotoMap] = useState({})   // recipe_id -> photo_url (для миниатюр в таблице)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [ingredients, setIngredients] = useState([])

  // photo
  const [selectedId,     setSelectedId]     = useState(null)
  const [photoUrl,       setPhotoUrl]       = useState(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError,     setPhotoError]     = useState('')
  const photoInputRef = useRef(null)

  // menu / delete
  const [openMenu,     setOpenMenu]     = useState(null)
  const [deleteRecipe, setDeleteRecipe] = useState(null)
  const [deleteError,  setDeleteError]  = useState('')
  const [deleting,     setDeleting]     = useState(false)

  // edit modal
  const [editRecipe,      setEditRecipe]      = useState(null)
  const [editForm,        setEditForm]        = useState({})
  const [editIngredients, setEditIngredients] = useState([])
  const [loadingIng,      setLoadingIng]      = useState(false)
  const [saving,          setSaving]          = useState(false)

  // ingredient search
  const [ingSearch,   setIngSearch]   = useState('')
  const [ingResults,  setIngResults]  = useState([])
  const [ingSearching,setIngSearching]= useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef(null)
  const searchTimer = useRef(null)

  useEffect(() => {
    supabase
      .from('recipe_cost')
      .select('recipe_id, recipe_article, recipe_name, total_cost')
      .order('recipe_article')
      .then(({ data }) => {
        setRows(data ?? [])
        setLoading(false)
        // подтянуть фото для миниатюр (только непустые)
        supabase
          .from('recipes')
          .select('id, photo_url')
          .not('photo_url', 'is', null)
          .then(({ data: photos }) => {
            const map = {}
            ;(photos ?? []).forEach(p => { if (p.photo_url) map[p.id] = p.photo_url })
            setPhotoMap(map)
          })
      })
  }, [])

  // Фильтр по активному ассортименту: какие recipe_id в него входят
  useEffect(() => {
    if (!assortment?.id) { setAllowedIds(null); return }
    let cancelled = false
    supabase
      .from('assortment_recipes')
      .select('recipe_id')
      .eq('assortment_id', assortment.id)
      .then(({ data }) => {
        if (cancelled) return
        setAllowedIds(new Set((data ?? []).map(r => r.recipe_id)))
      })
    return () => { cancelled = true }
  }, [assortment?.id])

  // Предзаполнение поиска из URL ?q= (для перехода со страницы Сырьё → Где используется)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setSearch(q)
  }, [searchParams])

  async function openRecipe(article) {
    if (selected === article) { setSelected(null); setIngredients([]); setSelectedId(null); setPhotoUrl(null); setPhotoError(''); return }
    setSelected(article)
    setPhotoError('')
    const { data: rec } = await supabase.from('recipes').select('id, photo_url').eq('article', article).single()
    if (!rec) { setSelectedId(null); setPhotoUrl(null); return }
    setSelectedId(rec.id)
    setPhotoUrl(rec.photo_url ?? null)

    const { data } = await supabase
      .from('recipe_ingredients')
      .select(`quantity, unit, material_id, sub_recipe_id, raw_materials(article,name), sub_recipe:recipes!sub_recipe_id(article,name,id)`)
      .eq('recipe_id', rec.id)

    const ings = data ?? []

    const materialIds   = ings.filter(i => i.material_id).map(i => i.material_id)
    const subRecipeIds  = ings.filter(i => i.sub_recipe_id).map(i => i.sub_recipe_id)

    const [pricesRes, recCostsRes] = await Promise.all([
      materialIds.length > 0
        ? supabase.from('raw_materials_with_price').select('id,current_price').in('id', materialIds)
        : Promise.resolve({ data: [] }),
      subRecipeIds.length > 0
        ? supabase.from('recipe_cost').select('recipe_id,cost_per_kg').in('recipe_id', subRecipeIds)
        : Promise.resolve({ data: [] }),
    ])

    const priceMap = {}
    ;(pricesRes.data ?? []).forEach(p => { priceMap[p.id] = p.current_price })
    const recCostMap = {}
    ;(recCostsRes.data ?? []).forEach(rc => { recCostMap[rc.recipe_id] = rc.cost_per_kg })

    const enriched = ings.map(ing => {
      const qty = parseFloat(ing.quantity) || 0
      const unitPrice = ing.material_id
        ? (priceMap[ing.material_id] ?? null)
        : (recCostMap[ing.sub_recipe_id] ?? null)
      return {
        ...ing,
        unit_price: unitPrice,
        line_cost: unitPrice != null ? unitPrice * qty : null,
      }
    })

    setIngredients(enriched)
  }

  // ── Photo: upload / replace ──
  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''               // позволяет выбрать тот же файл повторно
    if (!file || !selectedId) return
    setPhotoError('')

    const okTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!okTypes.includes(file.type)) { setPhotoError('Только JPG, PNG или WebP'); return }
    if (file.size > 5 * 1024 * 1024)  { setPhotoError('Файл больше 5 МБ'); return }

    setPhotoUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const safeArticle = String(selected).replace(/[^a-zA-Z0-9_-]+/g, '_')
      const path = `recipes/${safeArticle}-${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
      const newUrl = pub.publicUrl

      const { error: dbErr } = await supabase.from('recipes').update({ photo_url: newUrl }).eq('id', selectedId)
      if (dbErr) throw dbErr

      // удалить прежний файл, если это была замена
      const oldPath = storagePathFromUrl(photoUrl)
      if (oldPath && oldPath !== path) await supabase.storage.from(PHOTO_BUCKET).remove([oldPath])

      setPhotoUrl(newUrl)
      if (selectedId) setPhotoMap(prev => ({ ...prev, [selectedId]: newUrl }))
    } catch (err) {
      setPhotoError(err.message || 'Ошибка загрузки')
    } finally {
      setPhotoUploading(false)
    }
  }

  // ── Photo: remove ──
  async function handlePhotoRemove() {
    if (!selectedId || !photoUrl) return
    setPhotoError('')
    setPhotoUploading(true)
    try {
      const { error: dbErr } = await supabase.from('recipes').update({ photo_url: null }).eq('id', selectedId)
      if (dbErr) throw dbErr
      const oldPath = storagePathFromUrl(photoUrl)
      if (oldPath) await supabase.storage.from(PHOTO_BUCKET).remove([oldPath])
      setPhotoUrl(null)
      if (selectedId) setPhotoMap(prev => { const n = { ...prev }; delete n[selectedId]; return n })
    } catch (err) {
      setPhotoError(err.message || 'Ошибка удаления')
    } finally {
      setPhotoUploading(false)
    }
  }

  // ── Start Edit ──
  async function startEdit(row, e) {
    e.stopPropagation()
    setOpenMenu(null)
    setEditRecipe(row)
    setEditForm({ article: row.recipe_article, name: row.recipe_name })
    setIngSearch(''); setIngResults([]); setShowResults(false)
    setLoadingIng(true)

    const { data } = await supabase
      .from('recipe_ingredients')
      .select(`id, quantity, unit, raw_materials(id,article,name), sub_recipe:recipes!sub_recipe_id(id,article,name)`)
      .eq('recipe_id', row.recipe_id)

    setEditIngredients(
      (data ?? []).map((ing, i) => ({
        tempId: i,
        type: ing.raw_materials ? 'material' : 'recipe',
        material_id:   ing.raw_materials?.id   ?? null,
        sub_recipe_id: ing.sub_recipe?.id      ?? null,
        article: ing.raw_materials?.article ?? ing.sub_recipe?.article ?? '',
        name:    ing.raw_materials?.name    ?? ing.sub_recipe?.name    ?? '',
        quantity: String(parseFloat(ing.quantity)),
        unit: ing.unit,
      }))
    )
    setLoadingIng(false)
  }

  // ── Ingredient search (debounced) ──
  function handleIngSearchChange(q) {
    setIngSearch(q)
    setShowResults(true)
    clearTimeout(searchTimer.current)
    if (q.length < 2) { setIngResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setIngSearching(true)
      const [mats, recs] = await Promise.all([
        supabase.from('raw_materials').select('id,article,name').or(`article.ilike.%${q}%,name.ilike.%${q}%`).limit(8),
        supabase.from('recipes').select('id,article,name').or(`article.ilike.%${q}%,name.ilike.%${q}%`).neq('id', editRecipe?.recipe_id ?? '').limit(5),
      ])
      setIngResults([
        ...(mats.data ?? []).map(m => ({ ...m, type: 'material' })),
        ...(recs.data ?? []).map(r => ({ ...r, type: 'recipe' })),
      ])
      setIngSearching(false)
    }, 300)
  }

  function addIngredient(item) {
    setEditIngredients(prev => [...prev, {
      tempId: Date.now() + Math.random(),
      type: item.type,
      material_id:   item.type === 'material' ? item.id : null,
      sub_recipe_id: item.type === 'recipe'   ? item.id : null,
      article: item.article,
      name:    item.name,
      quantity: '0.1000',
      unit: 'кг',
    }])
    setIngSearch(''); setIngResults([]); setShowResults(false)
    searchRef.current?.focus()
  }

  function removeIngredient(tempId) {
    setEditIngredients(prev => prev.filter(i => i.tempId !== tempId))
  }

  function updateIngredient(tempId, field, value) {
    setEditIngredients(prev => prev.map(i => i.tempId === tempId ? { ...i, [field]: value } : i))
  }

  // ── Save ──
  async function saveEdit() {
    if (!editRecipe) return
    setSaving(true)

    await supabase.from('recipes').update({
      article: editForm.article.trim(),
      name:    editForm.name.trim(),
    }).eq('id', editRecipe.recipe_id)

    await supabase.from('recipe_ingredients').delete().eq('recipe_id', editRecipe.recipe_id)
    if (editIngredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        editIngredients.map(ing => ({
          recipe_id:     editRecipe.recipe_id,
          material_id:   ing.material_id   ?? null,
          sub_recipe_id: ing.sub_recipe_id ?? null,
          quantity:      parseFloat(ing.quantity) || 0,
          unit:          ing.unit,
        }))
      )
    }

    setRows(prev => prev.map(r =>
      r.recipe_id === editRecipe.recipe_id
        ? { ...r, recipe_article: editForm.article.trim(), recipe_name: editForm.name.trim() }
        : r
    ))
    if (selected === editRecipe.recipe_article) {
      setSelected(editForm.article.trim())
      const mapped = editIngredients.map(ing => ({
        quantity: ing.quantity, unit: ing.unit,
        material_id: ing.material_id,
        sub_recipe_id: ing.sub_recipe_id,
        raw_materials: ing.type === 'material' ? { article: ing.article, name: ing.name } : null,
        sub_recipe:    ing.type === 'recipe'   ? { article: ing.article, name: ing.name } : null,
        unit_price: null,
        line_cost: null,
      }))
      setIngredients(mapped)
    }

    setEditRecipe(null)
    setSaving(false)
  }

  // ── Delete ──
  async function startDelete(row, e) {
    e.stopPropagation()
    setOpenMenu(null)
    setDeleteError('')
    const { data: linked } = await supabase.from('products').select('article').eq('recipe_id', row.recipe_id).limit(5)
    if (linked?.length) setDeleteError(`Рецепт используется в SKU: ${linked.map(p => p.article).join(', ')}. Сначала удалите SKU.`)
    setDeleteRecipe(row)
  }

  async function confirmDelete() {
    if (!deleteRecipe || deleteError) return
    setDeleting(true)
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', deleteRecipe.recipe_id)
    await supabase.from('recipes').delete().eq('id', deleteRecipe.recipe_id)
    setRows(prev => prev.filter(r => r.recipe_id !== deleteRecipe.recipe_id))
    setPhotoMap(prev => { const n = { ...prev }; delete n[deleteRecipe.recipe_id]; return n })
    if (selected === deleteRecipe.recipe_article) { setSelected(null); setIngredients([]); setSelectedId(null); setPhotoUrl(null) }
    setDeleteRecipe(null)
    setDeleting(false)
  }

  // ── Экспорт открытого рецепта в Excel ──
  // Принимает массив рецептов (сейчас всегда один открытый) — каждый ляжет на отдельный лист.
  function exportRecipesXlsx(recipeList) {
    if (!recipeList || recipeList.length === 0) return
    const wb = XLSX.utils.book_new()
    const usedSheetNames = new Set()

    for (const rec of recipeList) {
      const { article, name, ings } = rec
      const aoa = []
      aoa.push([name || 'Рецепт', null, null, null, null, null, article || ''])
      const total = ings.reduce((sum, i) => i.line_cost != null ? sum + i.line_cost : sum, 0)
      const perKg = ings.length > 0 ? total : 0
      aoa.push(['Себестоимость, ₽/кг:', null, null, null, null, null, Number(perKg.toFixed(2))])
      aoa.push([])
      aoa.push(['Артикул', 'Ингредиент', 'Тип', 'Кол-во', 'Ед.', 'Цена/ед., ₽', 'Стоимость, ₽'])

      for (const ing of ings) {
        const isSub = !!ing.sub_recipe
        const cname = ing.raw_materials?.name ?? ing.sub_recipe?.name ?? '—'
        const cart  = ing.raw_materials?.article ?? ing.sub_recipe?.article ?? ''
        aoa.push([
          cart,
          cname,
          isSub ? 'подрецепт' : 'сырьё',
          Number(parseFloat(ing.quantity) || 0),
          ing.unit || '',
          ing.unit_price != null ? Number(Number(ing.unit_price).toFixed(2)) : null,
          ing.line_cost  != null ? Number(Number(ing.line_cost).toFixed(2))  : null,
        ])
      }
      aoa.push([])
      aoa.push([null, null, null, null, null, 'ИТОГО:', Number(total.toFixed(2))])

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [
        { wch: 12 }, { wch: 38 }, { wch: 11 }, { wch: 9 }, { wch: 6 }, { wch: 13 }, { wch: 14 },
      ]
      ws['!freeze'] = { xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft', state: 'frozen' }

      // Имя листа = артикул, очищенное от запрещённых символов и <=31 симв.
      let sheetName = (article || 'Рецепт').replace(/[\\/?*[\]:]/g, '-').slice(0, 31)
      let uniq = sheetName, k = 2
      while (usedSheetNames.has(uniq)) { uniq = (sheetName.slice(0, 28) + '_' + k).slice(0, 31); k++ }
      usedSheetNames.add(uniq)
      XLSX.utils.book_append_sheet(wb, ws, uniq)
    }

    const first = recipeList[0]
    const safe = (first.name || 'recipe').replace(/[\\/?*[\]:"<>|]/g, '').replace(/\s+/g, '_').slice(0, 60)
    const fname = recipeList.length === 1
      ? `Рецепт_${first.article}_${safe}.xlsx`
      : `Рецепты_${recipeList.length}.xlsx`
    XLSX.writeFile(wb, fname)
  }

  function handleExportOpen() {
    if (!selected || ingredients.length === 0) return
    const row = rows.find(r => r.recipe_article === selected)
    exportRecipesXlsx([{
      article: selected,
      name: row?.recipe_name ?? selected,
      ings: ingredients,
    }])
  }

  const scopedRows = allowedIds ? rows.filter(r => allowedIds.has(r.recipe_id)) : rows
  const filtered = scopedRows.filter(r =>
    r.recipe_article.toLowerCase().includes(search.toLowerCase()) ||
    r.recipe_name.toLowerCase().includes(search.toLowerCase())
  )

  // Итого по составу панели
  const knownTotal = ingredients.reduce((sum, ing) => {
    return ing.line_cost != null ? sum + ing.line_cost : sum
  }, 0)
  const hasUnknownPrice = ingredients.some(ing => ing.line_cost == null)

  return (
    <div className="p-8">
      <PageHeader title="Рецепты" subtitle={`${scopedRows.length} купажей${assortment ? ` · ${assortment.name}` : ' в базе'}`} />

      <div className="relative mb-6 w-80">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по артикулу или названию…"
          className="w-full bg-forest border border-forest-light/40 rounded-lg pl-9 pr-4 py-2
                     text-cream text-sm font-body placeholder-muted/60 focus:outline-none focus:border-gold/50"
        />
      </div>

      {openMenu && <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />}

      <div className="flex gap-6">
        {/* Table */}
        <div className="flex-1 card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-forest">
              <tr className="text-left">
                <th className="w-14 p-4"></th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Артикул</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body">Название</th>
                <th className="text-muted text-xs uppercase tracking-widest p-4 font-body text-right">руб/кг</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
              ) : filtered.map(r => (
                <tr
                  key={r.recipe_article}
                  className={`table-row cursor-pointer ${selected === r.recipe_article ? 'bg-gold/10' : ''}`}
                  onClick={() => openRecipe(r.recipe_article)}
                >
                  <td className="pl-4 pr-0 py-2">
                    {photoMap[r.recipe_id] ? (
                      <img
                        src={photoMap[r.recipe_id]}
                        alt=""
                        loading="lazy"
                        className="w-10 h-10 rounded-md object-cover border border-forest-light/30"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md border border-dashed border-forest-light/25 flex items-center justify-center">
                        <ImageIcon size={13} className="text-muted/30" />
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono">{r.recipe_article}</span>
                  </td>
                  <td className="p-4 text-cream text-sm font-body">{r.recipe_name}</td>
                  <td className="p-4 text-right font-mono text-sm text-gold">{Number(r.total_cost).toFixed(2)}</td>
                  <td className="pr-3 text-right relative" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenMenu(openMenu === r.recipe_article ? null : r.recipe_article)}
                      className="text-muted hover:text-cream p-1.5 rounded hover:bg-forest-light/30 transition-colors"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {openMenu === r.recipe_article && (
                      <div className="absolute right-3 top-9 z-50 bg-forest-dark border border-forest-light/50 rounded-lg shadow-2xl py-1 w-44">
                        <button onClick={e => startEdit(r, e)}
                          className="w-full text-left px-4 py-2 text-sm text-cream hover:bg-forest-light/30 font-body flex items-center gap-2">
                          <Pencil size={13} /> Редактировать
                        </button>
                        <button onClick={e => startDelete(r, e)}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 font-body flex items-center gap-2">
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

        {/* Detail panel */}
        {selected && (
          <div className="w-80 card flex-shrink-0 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-cream">
                Состав рецепта
                <span className="ml-2 badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs">{selected}</span>
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleExportOpen}
                  disabled={ingredients.length === 0}
                  title="Скачать рецепт в Excel"
                  className="text-muted hover:text-gold transition-colors p-1 rounded hover:bg-forest-light/30 disabled:opacity-40 disabled:hover:text-muted"
                >
                  <Download size={15} />
                </button>
                <button onClick={() => { setSelected(null); setIngredients([]); setSelectedId(null); setPhotoUrl(null); setPhotoError('') }} className="text-muted hover:text-cream transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Фото купажа */}
            <div className="mb-4">
              {photoUrl ? (
                <div className="relative group">
                  <img
                    src={photoUrl}
                    alt="Фото купажа"
                    className="w-full h-44 object-cover rounded-lg border border-forest-light/30"
                  />
                  <div className="absolute inset-0 rounded-lg flex items-center justify-center gap-2
                                  bg-forest-dark/0 group-hover:bg-forest-dark/50 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploading}
                      className="bg-forest/90 border border-forest-light/40 text-cream text-xs font-body
                                 px-3 py-1.5 rounded-lg hover:border-gold/50 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Upload size={12} /> Заменить
                    </button>
                    <button
                      onClick={handlePhotoRemove}
                      disabled={photoUploading}
                      className="bg-red-900/70 border border-red-800/50 text-red-100 text-xs font-body
                                 px-3 py-1.5 rounded-lg hover:bg-red-800/70 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 size={12} /> Удалить
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  className="w-full h-32 rounded-lg border border-dashed border-forest-light/40 hover:border-gold/50
                             flex flex-col items-center justify-center gap-2 text-muted hover:text-gold transition-colors disabled:opacity-50"
                >
                  {photoUploading
                    ? <div className="w-5 h-5 border-2 border-gold/60 border-t-transparent rounded-full animate-spin" />
                    : <><ImageIcon size={20} /><span className="text-xs font-body">Загрузить фото купажа</span></>
                  }
                </button>
              )}
              {photoUploading && photoUrl && (
                <div className="text-muted text-xs font-mono mt-1.5 flex items-center gap-1.5">
                  <div className="w-3 h-3 border border-gold/60 border-t-transparent rounded-full animate-spin" /> Обработка…
                </div>
              )}
              {photoError && <div className="text-red-400 text-xs font-body mt-1.5">{photoError}</div>}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>

            {/* Заголовок колонок */}
            <div className="flex justify-between items-center pb-1.5 mb-1 border-b border-forest-light/20">
              <span className="text-muted text-xs font-body uppercase tracking-widest">Ингредиент</span>
              <div className="flex gap-3 items-center">
                <span className="text-muted text-xs font-body uppercase tracking-widest w-16 text-right">кол-во</span>
                <span className="text-muted text-xs font-body uppercase tracking-widest w-20 text-right">стоимость</span>
              </div>
            </div>

            {/* Список */}
            <div className="space-y-0.5 flex-1">
              {ingredients.map((ing, i) => {
                const name    = ing.raw_materials?.name ?? ing.sub_recipe?.name ?? '—'
                const art     = ing.raw_materials?.article ?? ing.sub_recipe?.article ?? ''
                const isSub   = !!ing.sub_recipe
                return (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-forest-light/20">
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-cream text-xs font-body flex items-center gap-1.5 leading-tight">
                        {isSub && <FlaskConical size={10} className="text-gold/70 flex-shrink-0" />}
                        <span className="truncate">{name}</span>
                      </div>
                      <div className="text-muted text-xs font-mono">{art}</div>
                    </div>
                    <div className="flex gap-3 items-center flex-shrink-0">
                      <div className="text-gold font-mono text-xs w-16 text-right whitespace-nowrap">
                        {ing.quantity} {ing.unit}
                      </div>
                      <div className="font-mono text-xs w-20 text-right whitespace-nowrap">
                        {ing.line_cost != null
                          ? <span className="text-cream/80">{ing.line_cost.toFixed(2)}</span>
                          : <span className="text-muted/50">—</span>
                        }
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Итого */}
            {ingredients.length > 0 && (
              <div className="mt-3 pt-3 border-t border-forest-light/40 flex justify-between items-baseline">
                <span className="text-muted text-xs font-body uppercase tracking-widest">Итого</span>
                <div className="text-right">
                  <span className="text-gold font-mono text-sm font-semibold">
                    {knownTotal.toFixed(2)} руб
                  </span>
                  {hasUnknownPrice && (
                    <div className="text-muted/60 text-xs font-body">* часть цен отсутствует</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ EDIT MODAL ══ */}
      {editRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/80 backdrop-blur-sm p-4">
          <div className="bg-forest border border-forest-light/40 rounded-xl shadow-2xl w-[560px] max-h-[90vh] flex flex-col">

            <div className="flex items-center justify-between p-6 border-b border-forest-light/30">
              <div>
                <h3 className="font-display text-lg text-cream">Редактировать рецепт</h3>
                <span className="font-mono text-gold/70 text-xs">{editRecipe.recipe_article}</span>
              </div>
              <button onClick={() => setEditRecipe(null)} className="text-muted hover:text-cream"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="flex gap-3">
                <div className="w-36">
                  <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Артикул</label>
                  <input
                    value={editForm.article}
                    onChange={e => setEditForm(f => ({ ...f, article: e.target.value }))}
                    className="w-full bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                               text-cream text-sm font-mono focus:outline-none focus:border-gold/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-muted text-xs uppercase tracking-widest font-body block mb-1.5">Название</label>
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                               text-cream text-sm font-body focus:outline-none focus:border-gold/50"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-muted text-xs uppercase tracking-widest font-body">Состав</span>
                  <span className="text-muted text-xs font-mono">{editIngredients.length} позиций</span>
                </div>

                {loadingIng ? (
                  <div className="text-muted text-xs font-mono animate-pulse py-4 text-center">Загрузка...</div>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {editIngredients.map(ing => (
                      <div key={ing.tempId}
                        className="flex items-center gap-2 bg-forest-dark rounded-lg px-3 py-2 group">
                        <div className="flex-shrink-0">
                          {ing.type === 'recipe'
                            ? <FlaskConical size={12} className="text-gold/60" />
                            : <div className="w-3 h-3 rounded-full bg-forest-light/50" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-cream text-xs font-body truncate">{ing.name}</div>
                          <div className="text-muted text-xs font-mono">{ing.article}</div>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={ing.quantity}
                          onChange={e => updateIngredient(ing.tempId, 'quantity', e.target.value)}
                          className="w-20 bg-forest border border-forest-light/40 rounded px-2 py-1
                                     text-cream text-xs font-mono text-right
                                     focus:outline-none focus:border-gold/50"
                        />
                        <select
                          value={ing.unit}
                          onChange={e => updateIngredient(ing.tempId, 'unit', e.target.value)}
                          className="bg-forest border border-forest-light/40 rounded px-1.5 py-1
                                     text-muted text-xs font-mono focus:outline-none focus:border-gold/50 appearance-none cursor-pointer w-12"
                        >
                          <option value="кг">кг</option>
                          <option value="шт">шт</option>
                          <option value="г">г</option>
                          <option value="мл">мл</option>
                        </select>
                        <button
                          onClick={() => removeIngredient(ing.tempId)}
                          className="text-muted/40 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <div className="flex items-center gap-2 bg-forest-dark border border-forest-light/40 rounded-lg px-3 py-2
                                  focus-within:border-gold/50 transition-colors">
                    <Plus size={13} className="text-muted flex-shrink-0" />
                    <input
                      ref={searchRef}
                      value={ingSearch}
                      onChange={e => handleIngSearchChange(e.target.value)}
                      onFocus={() => ingSearch.length >= 2 && setShowResults(true)}
                      placeholder="Добавить ингредиент — артикул или название…"
                      className="flex-1 bg-transparent text-cream text-xs font-body placeholder-muted/50
                                 focus:outline-none"
                    />
                    {ingSearching && <div className="w-3 h-3 border border-gold/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                  </div>

                  {showResults && ingResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-forest-dark border border-forest-light/50
                                    rounded-lg shadow-2xl max-h-56 overflow-y-auto">
                      {ingResults.map(item => (
                        <button
                          key={`${item.type}-${item.id}`}
                          onMouseDown={() => addIngredient(item)}
                          className="w-full text-left px-3 py-2 hover:bg-forest-light/20 transition-colors flex items-center gap-3"
                        >
                          {item.type === 'recipe'
                            ? <FlaskConical size={12} className="text-gold/60 flex-shrink-0" />
                            : <div className="w-3 h-3 rounded-full bg-forest-light/50 flex-shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <div className="text-cream text-xs font-body truncate">{item.name}</div>
                            <div className="text-muted text-xs font-mono">{item.article}</div>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-body flex-shrink-0 ${
                            item.type === 'recipe'
                              ? 'bg-gold/10 text-gold/70'
                              : 'bg-forest-light/30 text-muted'
                          }`}>
                            {item.type === 'recipe' ? 'рецепт' : 'сырьё'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {showResults && ingSearch.length >= 2 && !ingSearching && ingResults.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-forest-dark border border-forest-light/50 rounded-lg shadow-2xl px-3 py-3">
                      <span className="text-muted text-xs font-body">Ничего не найдено</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end p-6 border-t border-forest-light/30">
              <button onClick={() => setEditRecipe(null)}
                className="px-4 py-2 text-sm text-muted hover:text-cream font-body transition-colors">
                Отмена
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="btn-primary text-sm disabled:opacity-50">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {deleteRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/80 backdrop-blur-sm">
          <div className="bg-forest border border-forest-light/40 rounded-xl p-6 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-cream">Удалить рецепт?</h3>
              <button onClick={() => setDeleteRecipe(null)} className="text-muted hover:text-cream"><X size={16} /></button>
            </div>
            <div className="bg-forest-dark rounded-lg p-3 mb-4">
              <span className="font-mono text-gold text-sm">{deleteRecipe.recipe_article}</span>
              <span className="text-cream text-sm font-body ml-2">{deleteRecipe.recipe_name}</span>
            </div>
            {deleteError ? (
              <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 mb-5">
                <p className="text-red-400 text-xs font-body">{deleteError}</p>
              </div>
            ) : (
              <p className="text-red-400 text-xs font-body mb-5">Будут удалены рецепт и все его ингредиенты. Это действие необратимо.</p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteRecipe(null)}
                className="px-4 py-2 text-sm text-muted hover:text-cream font-body transition-colors">Отмена</button>
              {!deleteError && (
                <button onClick={confirmDelete} disabled={deleting}
                  className="bg-red-800 hover:bg-red-700 text-red-100 text-sm px-4 py-2 rounded-lg font-body transition-colors disabled:opacity-50 flex items-center gap-2">
                  <Trash2 size={13} />{deleting ? 'Удаление...' : 'Удалить'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
