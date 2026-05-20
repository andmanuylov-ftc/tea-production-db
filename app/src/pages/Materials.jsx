import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import {
  Search, Pencil, Trash2, X, Check, Clock, MoreHorizontal, Upload,
  Eye, FlaskConical, Package, ExternalLink, TrendingUp, TrendingDown, Minus,
  Plus,
} from 'lucide-react'

// нормализация в кг (для расчёта долей в рецептах, где output_unit обычно 'кг')
function toKg(quantity, unit) {
  const q = parseFloat(quantity) || 0
  if (unit === 'г')  return q / 1000
  if (unit === 'кг') return q
  return q // для шт/мл — оставим как есть; доля будет рассчитана условно
}

function fmt(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU')
}

function fmtShare(n) {
  if (n == null || isNaN(n)) return '—'
  if (n < 0.01) return '<0,01%'
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

// % изменения текущей цены относительно предыдущей по времени
function priceChangePct(curr, prev) {
  const c = Number(curr), p = Number(prev)
  if (!p || isNaN(c) || isNaN(p)) return null
  return ((c - p) / p) * 100
}

// Допустимые единицы (по правилам CONTEXT.md)
const UNIT_OPTIONS = ['кг', 'шт', 'погм', 'рул']

export default function Materials() {
  const navigate = useNavigate()
  const [rows, setRows]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [categories, setCategories]   = useState([])

  // edit panel
  const [editRow, setEditRow]         = useState(null)
  const [editName, setEditName]       = useState('')
  const [editPrice, setEditPrice]     = useState('')
  const [history, setHistory]         = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [saving, setSaving]           = useState(false)

  // usage panel
  const [usageRow, setUsageRow]               = useState(null)
  const [usage, setUsage]                     = useState(null)
  const [loadingUsage, setLoadingUsage]       = useState(false)
  const [usageHistory, setUsageHistory]       = useState([])
  const [usageHistLoading, setUsageHistLoading] = useState(false)

  // add panel — новое сырьё/материал
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [addArticle, setAddArticle]     = useState('')
  const [addName, setAddName]           = useState('')
  const [addCategoryId, setAddCategoryId] = useState('')
  const [addUnit, setAddUnit]           = useState('кг')
  const [addPrice, setAddPrice]         = useState('')
  const [addDate, setAddDate]           = useState(new Date().toISOString().slice(0, 10))
  const [addSupplier, setAddSupplier]   = useState('')
  const [addError, setAddError]         = useState('')
  const [addSaving, setAddSaving]       = useState(false)

  // row menu
  const [confirmId, setConfirmId]     = useState(null)
  const [openMenuId, setOpenMenuId]   = useState(null)
  const mounted = useRef(true)
  const menuRef = useRef(null)

  useEffect(() => {
    mounted.current = true
    loadRows()
    loadCategories()
    return () => { mounted.current = false }
  }, [])

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

  async function loadCategories() {
    const { data } = await supabase
      .from('material_categories')
      .select('id, name')
      .order('name')
    if (mounted.current) setCategories(data ?? [])
  }

  async function loadPriceHistory(materialId) {
    const { data } = await supabase
      .from('material_prices')
      .select('price_per_unit, valid_from')
      .eq('material_id', materialId)
      .order('valid_from', { ascending: false })
      .limit(3)
    return data ?? []
  }

  // ───── Edit panel ─────

  async function openEdit(row) {
    setOpenMenuId(null)
    setShowAddPanel(false) // закрываем add если было
    setUsageRow(null); setUsage(null); setUsageHistory([]) // закрываем usage если было
    setEditRow(row)
    setEditName(row.name)
    setEditPrice('')
    setHistory([])
    setHistLoading(true)
    const h = await loadPriceHistory(row.id)
    if (mounted.current) { setHistory(h); setHistLoading(false) }
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
    if (usageRow?.id === id) { setUsageRow(null); setUsage(null); setUsageHistory([]) }
    if (editRow?.id === id) setEditRow(null)
  }

  // ───── Add panel ─────

  function openAddPanel() {
    // Закрываем все остальные панели
    setEditRow(null)
    setUsageRow(null); setUsage(null); setUsageHistory([])
    setOpenMenuId(null)
    // Сбрасываем форму
    setAddArticle('')
    setAddName('')
    setAddCategoryId('')
    setAddUnit('кг')
    setAddPrice('')
    setAddDate(new Date().toISOString().slice(0, 10))
    setAddSupplier('')
    setAddError('')
    setShowAddPanel(true)
  }

  function closeAddPanel() {
    setShowAddPanel(false)
    setAddError('')
  }

  async function createMaterial() {
    setAddError('')

    // Валидация
    const article = addArticle.trim()
    const name    = addName.trim()
    const supplier = addSupplier.trim()
    const priceVal = parseFloat(addPrice.replace(',', '.'))

    if (!article)            { setAddError('Укажите артикул'); return }
    if (!name)               { setAddError('Укажите название'); return }
    if (!addCategoryId)      { setAddError('Выберите категорию'); return }
    if (!UNIT_OPTIONS.includes(addUnit)) { setAddError('Выберите единицу измерения'); return }
    if (isNaN(priceVal) || priceVal <= 0) { setAddError('Цена должна быть больше 0'); return }
    if (!addDate)            { setAddError('Укажите дату цены'); return }

    setAddSaving(true)

    try {
      // Проверка дубликата артикула
      const { data: dup, error: dupErr } = await supabase
        .from('raw_materials')
        .select('id, name')
        .eq('article', article)
        .maybeSingle()
      if (dupErr) throw new Error(dupErr.message)
      if (dup) {
        setAddError(`Артикул «${article}» уже занят: «${dup.name}»`)
        setAddSaving(false)
        return
      }

      // 1. Создаём материал
      const { data: matIns, error: matErr } = await supabase
        .from('raw_materials')
        .insert({
          article,
          name,
          category_id: addCategoryId,
          unit: addUnit,
          supplier: supplier || null,
          is_active: true,
        })
        .select('id')
        .single()
      if (matErr) throw new Error(matErr.message)

      // 2. Создаём цену (обязательно по правилу — без цены позиция не имеет смысла)
      const { error: priceErr } = await supabase
        .from('material_prices')
        .insert({
          material_id:    matIns.id,
          price_per_unit: priceVal,
          valid_from:     addDate,
          supplier:       supplier || null,
        })
      if (priceErr) {
        // Откат: материал создан, цена нет — удаляем материал, чтобы не остался без цены
        await supabase.from('raw_materials').delete().eq('id', matIns.id)
        throw new Error(`Цена: ${priceErr.message}`)
      }

      // Обновляем список и закрываем форму
      await loadRows()
      if (mounted.current) {
        setAddSaving(false)
        setShowAddPanel(false)
        // Подсветить новую строку через поиск
        setSearch(article)
      }
    } catch (e) {
      setAddError(e.message || 'Ошибка сохранения')
      setAddSaving(false)
    }
  }

  // ───── Usage panel ─────

  async function openUsage(row) {
    setOpenMenuId(null)
    setEditRow(null) // закрываем edit
    setShowAddPanel(false) // закрываем add
    setUsageRow(row)
    setUsage(null)
    setUsageHistory([])
    setLoadingUsage(true)
    setUsageHistLoading(true)

    // История цен — параллельно с расчётом usage
    loadPriceHistory(row.id).then(h => {
      if (mounted.current) { setUsageHistory(h); setUsageHistLoading(false) }
    })

    const matId = row.id

    // 1) Прямое использование в recipe_ingredients (как material_id)
    const { data: directIngs } = await supabase
      .from('recipe_ingredients')
      .select('recipe_id, quantity, unit')
      .eq('material_id', matId)

    const directRecipeIds = [...new Set((directIngs ?? []).map(r => r.recipe_id))]

    // 2) Данные этих рецептов
    const { data: directRecipesData } = directRecipeIds.length
      ? await supabase
          .from('recipes')
          .select('id, article, name, output_quantity, output_unit')
          .in('id', directRecipeIds)
      : { data: [] }

    const directRecipesMap = Object.fromEntries((directRecipesData ?? []).map(r => [r.id, r]))

    // считаем долю материала в каждом рецепте (если в одном рецепте несколько строк — суммируем)
    const directRecipesAgg = {}
    for (const ing of directIngs ?? []) {
      const rec = directRecipesMap[ing.recipe_id]
      if (!rec) continue
      const qtyKg    = toKg(ing.quantity, ing.unit)
      const outputKg = toKg(rec.output_quantity, rec.output_unit)
      const share = outputKg > 0 ? (qtyKg / outputKg) * 100 : null
      if (!directRecipesAgg[rec.id]) {
        directRecipesAgg[rec.id] = { id: rec.id, article: rec.article, name: rec.name, sharePercent: share }
      } else if (share != null) {
        directRecipesAgg[rec.id].sharePercent =
          (directRecipesAgg[rec.id].sharePercent ?? 0) + share
      }
    }
    const directRecipes = Object.values(directRecipesAgg)
      .sort((a, b) => (b.sharePercent ?? 0) - (a.sharePercent ?? 0))

    // 3) Косвенное использование: где directRecipes лежат как sub_recipe в других рецептах
    const { data: parentIngs } = directRecipeIds.length
      ? await supabase
          .from('recipe_ingredients')
          .select('recipe_id, sub_recipe_id, quantity, unit')
          .in('sub_recipe_id', directRecipeIds)
      : { data: [] }

    const parentRecipeIds = [...new Set((parentIngs ?? []).map(r => r.recipe_id))]
    const { data: parentRecipesData } = parentRecipeIds.length
      ? await supabase
          .from('recipes')
          .select('id, article, name, output_quantity, output_unit')
          .in('id', parentRecipeIds)
      : { data: [] }

    const parentRecipesMap = Object.fromEntries((parentRecipesData ?? []).map(r => [r.id, r]))

    // для каждой связи: материал → подрецепт (sub) → parent
    const indirectRecipesAgg = {}
    for (const ing of parentIngs ?? []) {
      const sub    = directRecipesAgg[ing.sub_recipe_id]
      const parent = parentRecipesMap[ing.recipe_id]
      if (!sub || !parent) continue

      const subQtyKg       = toKg(ing.quantity, ing.unit)
      const parentOutputKg = toKg(parent.output_quantity, parent.output_unit)
      const subShareInParent = parentOutputKg > 0 ? (subQtyKg / parentOutputKg) : 0
      const matShareInSub    = sub.sharePercent != null ? sub.sharePercent / 100 : null
      const finalShare = matShareInSub != null ? matShareInSub * subShareInParent * 100 : null

      if (!indirectRecipesAgg[parent.id]) {
        indirectRecipesAgg[parent.id] = {
          id: parent.id,
          article: parent.article,
          name: parent.name,
          sharePercent: finalShare,
          vias: new Set([sub.article]),
        }
      } else {
        if (finalShare != null) {
          indirectRecipesAgg[parent.id].sharePercent =
            (indirectRecipesAgg[parent.id].sharePercent ?? 0) + finalShare
        }
        indirectRecipesAgg[parent.id].vias.add(sub.article)
      }
    }
    const indirectRecipes = Object.values(indirectRecipesAgg)
      .map(r => ({ ...r, via: [...r.vias].join(', ') }))
      .sort((a, b) => (b.sharePercent ?? 0) - (a.sharePercent ?? 0))

    // 4) Прямое использование в SKU (sku_recipe_components.material_id)
    const { data: directSkuComps } = await supabase
      .from('sku_recipe_components')
      .select('product_id, quantity, unit')
      .eq('material_id', matId)

    const directProductIds = [...new Set((directSkuComps ?? []).map(c => c.product_id))]
    const { data: directProductsData } = directProductIds.length
      ? await supabase
          .from('products')
          .select('id, article, name')
          .in('id', directProductIds)
      : { data: [] }
    const directProductsMap = Object.fromEntries((directProductsData ?? []).map(p => [p.id, p]))

    const directSkusAgg = {}
    for (const c of directSkuComps ?? []) {
      const p = directProductsMap[c.product_id]
      if (!p) continue
      if (!directSkusAgg[p.id]) {
        directSkusAgg[p.id] = {
          id: p.id, article: p.article, name: p.name,
          quantity: parseFloat(c.quantity) || 0,
          unit: c.unit,
        }
      } else {
        // если несколько строк того же материала в одном SKU — суммируем (если ед. совпадают)
        if (directSkusAgg[p.id].unit === c.unit) {
          directSkusAgg[p.id].quantity += parseFloat(c.quantity) || 0
        }
      }
    }
    const directSkus = Object.values(directSkusAgg).sort((a, b) => a.article.localeCompare(b.article))

    // 5) Косвенное использование в SKU: SKU содержит recipe_id, который входит в 
    //    directRecipeIds (материал прямо в рецепте) или parentRecipeIds (материал через sub)
    const allRecipeIdsForSku = [...new Set([...directRecipeIds, ...parentRecipeIds])]
    const { data: indirectSkuComps } = allRecipeIdsForSku.length
      ? await supabase
          .from('sku_recipe_components')
          .select('product_id, recipe_id, quantity, unit')
          .in('recipe_id', allRecipeIdsForSku)
      : { data: [] }

    const indirectProductIds = [...new Set((indirectSkuComps ?? []).map(c => c.product_id))]
    const { data: indirectProductsData } = indirectProductIds.length
      ? await supabase
          .from('products')
          .select('id, article, name')
          .in('id', indirectProductIds)
      : { data: [] }
    const indirectProductsMap = Object.fromEntries((indirectProductsData ?? []).map(p => [p.id, p]))

    const allRecipesMap = { ...directRecipesMap, ...parentRecipesMap }
    const indirectSkusAgg = {}
    for (const c of indirectSkuComps ?? []) {
      const p   = indirectProductsMap[c.product_id]
      const rec = allRecipesMap[c.recipe_id]
      if (!p || !rec) continue
      if (!indirectSkusAgg[p.id]) {
        indirectSkusAgg[p.id] = {
          id: p.id, article: p.article, name: p.name,
          vias: new Set([rec.article]),
        }
      } else {
        indirectSkusAgg[p.id].vias.add(rec.article)
      }
    }
    const indirectSkus = Object.values(indirectSkusAgg)
      .map(s => ({ ...s, via: [...s.vias].join(', ') }))
      .sort((a, b) => a.article.localeCompare(b.article))

    if (mounted.current) {
      setUsage({ directRecipes, indirectRecipes, directSkus, indirectSkus })
      setLoadingUsage(false)
    }
  }

  function goToRecipe(article) {
    navigate('/recipes?q=' + encodeURIComponent(article))
  }
  function goToSku(article) {
    navigate('/skus?q=' + encodeURIComponent(article))
  }

  // ───── Render ─────

  const filtered = rows.filter(r =>
    r.article.toLowerCase().includes(search.toLowerCase()) ||
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <PageHeader
        title="Сырьё и материалы"
        subtitle={`${rows.length} позиций в базе`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={openAddPanel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-300
                         border border-emerald-500/30 text-sm font-body hover:bg-emerald-500/25 transition-all"
            >
              <Plus size={14} />
              Новая позиция
            </button>
            <button
              onClick={() => navigate('/materials/import')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/15 text-gold
                         border border-gold/20 text-sm font-body hover:bg-gold/25 transition-all"
            >
              <Upload size={14} />
              Импорт из Excel
            </button>
          </div>
        }
      />

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
        <div className="flex-1 card p-0">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-left rounded-tl-[var(--border-radius-lg)]">Артикул</th>
                <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-left">Название</th>
                <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-left">Ед.</th>
                <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Цена без НДС, руб.</th>
                <th className="bg-forest text-muted text-xs uppercase tracking-widest p-4 font-body text-right">Дата цены</th>
                <th className="bg-forest w-20 rounded-tr-[var(--border-radius-lg)]"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-4 text-muted text-sm font-mono animate-pulse">Загрузка...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-muted text-sm text-center font-body">Ничего не найдено</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className={`table-row ${editRow?.id === r.id || usageRow?.id === r.id ? 'bg-gold/5' : ''}`}>
                  <td className="p-4 border-t border-forest-light/20">
                    <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs">
                      {r.article}
                    </span>
                  </td>
                  <td className="p-4 border-t border-forest-light/20 text-cream text-sm font-body">{r.name}</td>
                  <td className="p-4 border-t border-forest-light/20 text-muted text-sm font-mono">{r.unit}</td>
                  <td className="p-4 border-t border-forest-light/20 text-right font-mono text-sm text-gold">{fmt(r.current_price)}</td>
                  <td className="p-4 border-t border-forest-light/20 text-right font-mono text-xs text-muted">{fmtDate(r.price_date)}</td>

                  <td className="p-2 border-t border-forest-light/20 text-right">
                    <div className="flex items-center justify-end gap-0.5" ref={openMenuId === r.id ? menuRef : null}>
                      <button
                        onClick={() => openUsage(r)}
                        title="Где используется"
                        className={`p-1.5 rounded-md transition-colors ${
                          usageRow?.id === r.id
                            ? 'text-gold bg-gold/10'
                            : 'text-muted hover:text-cream hover:bg-forest-light/50'
                        }`}
                      >
                        <Eye size={15} />
                      </button>

                      <div className="relative">
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
                                  <button onClick={() => deleteRow(r.id)}
                                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                                    <Check size={12} /> Да
                                  </button>
                                  <button onClick={() => { setConfirmId(null); setOpenMenuId(null) }}
                                    className="flex items-center gap-1 text-xs text-muted hover:text-cream transition-colors">
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Панель добавления новой позиции */}
        {showAddPanel && (
          <div className="w-80 flex-shrink-0 card">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-sm font-semibold text-cream">Новая позиция</h3>
              <button onClick={closeAddPanel} className="text-muted hover:text-cream transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="mb-3">
              <label className="text-muted text-xs font-body block mb-1">Артикул <span className="text-red-400">*</span></label>
              <input
                value={addArticle}
                onChange={e => setAddArticle(e.target.value)}
                placeholder="например, 2317"
                className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                           text-cream text-sm font-mono focus:outline-none focus:border-gold/50"
              />
            </div>

            <div className="mb-3">
              <label className="text-muted text-xs font-body block mb-1">Название <span className="text-red-400">*</span></label>
              <input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="например, Яблоко 7-9мм"
                className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                           text-cream text-sm font-body focus:outline-none focus:border-gold/50"
              />
            </div>

            <div className="mb-3">
              <label className="text-muted text-xs font-body block mb-1">Категория <span className="text-red-400">*</span></label>
              <select
                value={addCategoryId}
                onChange={e => setAddCategoryId(e.target.value)}
                className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                           text-cream text-sm font-body focus:outline-none focus:border-gold/50"
              >
                <option value="">— выберите категорию —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-muted text-xs font-body block mb-1">Ед. <span className="text-red-400">*</span></label>
                <select
                  value={addUnit}
                  onChange={e => setAddUnit(e.target.value)}
                  className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-body focus:outline-none focus:border-gold/50"
                >
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-muted text-xs font-body block mb-1">Цена ₽ <span className="text-red-400">*</span></label>
                <input
                  value={addPrice}
                  onChange={e => setAddPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                             text-cream text-sm font-mono focus:outline-none focus:border-gold/50"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="text-muted text-xs font-body block mb-1">Дата цены <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={addDate}
                onChange={e => setAddDate(e.target.value)}
                className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                           text-cream text-sm font-mono focus:outline-none focus:border-gold/50"
              />
            </div>

            <div className="mb-4">
              <label className="text-muted text-xs font-body block mb-1">
                Поставщик <span className="text-muted/50">(необязательно)</span>
              </label>
              <input
                value={addSupplier}
                onChange={e => setAddSupplier(e.target.value)}
                placeholder="например, СимТех"
                className="w-full bg-forest border border-forest-light/40 rounded-lg px-3 py-2
                           text-cream text-sm font-body focus:outline-none focus:border-gold/50"
              />
            </div>

            {addError && (
              <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg
                              text-red-300 text-xs font-body">
                {addError}
              </div>
            )}

            <p className="text-muted/60 text-[11px] font-body mb-3 leading-relaxed">
              Позиция и её цена создаются одной операцией. Без цены сырьё не добавляется.
            </p>

            <button
              onClick={createMaterial}
              disabled={addSaving}
              className="w-full py-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30
                         text-sm font-body hover:bg-emerald-500/25 transition-all disabled:opacity-50"
            >
              {addSaving ? 'Сохранение...' : 'Создать позицию'}
            </button>
          </div>
        )}

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
              <PriceHistoryBlock history={history} loading={histLoading} />
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

        {/* Панель «Где используется» */}
        {usageRow && (
          <div className="w-96 flex-shrink-0 card overflow-y-auto max-h-[calc(100vh-10rem)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-semibold text-cream">Где используется</h3>
              <button onClick={() => { setUsageRow(null); setUsage(null); setUsageHistory([]) }} className="text-muted hover:text-cream transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="mb-5 pb-3 border-b border-forest-light/30">
              <span className="badge bg-forest-light text-cream border border-forest-light font-mono text-xs mr-2">
                {usageRow.article}
              </span>
              <span className="text-cream text-xs font-body">{usageRow.name}</span>
            </div>

            {/* История цен — сверху */}
            <div className="mb-5 pb-5 border-b border-forest-light/30">
              <PriceHistoryBlock history={usageHistory} loading={usageHistLoading} />
            </div>

            {loadingUsage ? (
              <p className="text-muted text-sm font-mono animate-pulse">Загрузка...</p>
            ) : usage ? (
              <div className="space-y-5">
                {/* В рецептах прямо */}
                <UsageSection
                  icon={FlaskConical}
                  iconColor="text-emerald-400"
                  title="В рецептах (прямо)"
                  count={usage.directRecipes.length}
                  empty="нет"
                >
                  {usage.directRecipes.map(r => (
                    <UsageRow
                      key={r.id}
                      onClick={() => goToRecipe(r.article)}
                      article={r.article}
                      name={r.name}
                      right={<span className="text-gold font-mono text-xs">{fmtShare(r.sharePercent)}</span>}
                    />
                  ))}
                </UsageSection>

                {/* В рецептах через подрецепт */}
                <UsageSection
                  icon={FlaskConical}
                  iconColor="text-emerald-400/70"
                  title="В рецептах (через подрецепт)"
                  count={usage.indirectRecipes.length}
                  empty="нет"
                >
                  {usage.indirectRecipes.map(r => (
                    <UsageRow
                      key={r.id}
                      onClick={() => goToRecipe(r.article)}
                      article={r.article}
                      name={r.name}
                      sub={<span className="text-muted/70">через {r.via}</span>}
                      right={<span className="text-gold font-mono text-xs">{fmtShare(r.sharePercent)}</span>}
                    />
                  ))}
                </UsageSection>

                {/* В SKU прямо */}
                <UsageSection
                  icon={Package}
                  iconColor="text-amber-400"
                  title="В SKU (прямо)"
                  count={usage.directSkus.length}
                  empty="нет"
                >
                  {usage.directSkus.map(s => (
                    <UsageRow
                      key={s.id}
                      onClick={() => goToSku(s.article)}
                      article={s.article}
                      name={s.name}
                      right={<span className="text-cream/80 font-mono text-xs">{s.quantity} {s.unit}</span>}
                    />
                  ))}
                </UsageSection>

                {/* В SKU через рецепт */}
                <UsageSection
                  icon={Package}
                  iconColor="text-amber-400/70"
                  title="В SKU (через рецепт)"
                  count={usage.indirectSkus.length}
                  empty="нет"
                >
                  {usage.indirectSkus.map(s => (
                    <UsageRow
                      key={s.id}
                      onClick={() => goToSku(s.article)}
                      article={s.article}
                      name={s.name}
                      sub={<span className="text-muted/70">через {s.via}</span>}
                    />
                  ))}
                </UsageSection>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

// ───── Helpers ─────

function PriceHistoryBlock({ history, loading }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Clock size={13} className="text-muted" />
        <span className="text-muted text-xs font-body uppercase tracking-widest">
          История цен — последние 3
        </span>
      </div>
      {loading ? (
        <p className="text-muted text-xs font-mono animate-pulse">Загрузка...</p>
      ) : history.length === 0 ? (
        <p className="text-muted text-xs font-body">Цен не найдено</p>
      ) : history.map((h, i) => {
        const prev    = history[i + 1] // следующая по индексу = более ранняя по времени
        const pct     = prev ? priceChangePct(h.price_per_unit, prev.price_per_unit) : null
        const isCurr  = i === 0

        let badge = null
        if (pct != null) {
          const abs = Math.abs(pct)
          if (abs < 0.005) {
            badge = (
              <span className="flex items-center gap-0.5 text-muted/70 font-mono text-[10px]">
                <Minus size={10} /> 0%
              </span>
            )
          } else if (pct > 0) {
            badge = (
              <span className="flex items-center gap-0.5 text-red-400 font-mono text-[10px]">
                <TrendingUp size={10} /> +{abs.toFixed(abs < 10 ? 2 : 1)}%
              </span>
            )
          } else {
            badge = (
              <span className="flex items-center gap-0.5 text-emerald-400 font-mono text-[10px]">
                <TrendingDown size={10} /> −{abs.toFixed(abs < 10 ? 2 : 1)}%
              </span>
            )
          }
        }

        return (
          <div key={i} className="flex justify-between items-center py-2 border-b border-forest-light/30 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className="text-muted text-xs font-mono">{fmtDate(h.valid_from)}</span>
              {badge}
            </div>
            <span className={`font-mono text-xs ${isCurr ? 'text-gold font-semibold' : 'text-muted'}`}>
              {fmt(h.price_per_unit)} ₽
            </span>
          </div>
        )
      })}
    </>
  )
}

function UsageSection({ icon: Icon, iconColor, title, count, empty, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={12} className={iconColor} />
        <span className={`text-xs font-body uppercase tracking-widest ${iconColor}`}>{title}</span>
        <span className="text-muted text-xs font-mono ml-auto">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-muted/40 text-xs font-body italic">{empty}</p>
      ) : (
        <div className="space-y-0.5">{children}</div>
      )}
    </div>
  )
}

function UsageRow({ onClick, article, name, sub, right }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 py-2 px-2 -mx-2 rounded-md
                 hover:bg-forest-light/40 transition-colors text-left group"
    >
      <div className="flex-1 min-w-0">
        <div className="text-cream text-xs font-body truncate">{name}</div>
        <div className="font-mono text-xs text-muted">
          <span className="text-gold/80">{article}</span>
          {sub && <> · {sub}</>}
        </div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
      <ExternalLink size={11} className="text-muted/40 group-hover:text-gold/80 transition-colors flex-shrink-0" />
    </button>
  )
}
