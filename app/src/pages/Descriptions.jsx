import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import {
  Search, X, Sparkles, Save, CheckCircle2, AlertCircle,
  RefreshCw, ChevronDown, ChevronRight, Loader2
} from 'lucide-react'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-description`
const ANON_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

const STATUS = { IDLE: 'idle', GENERATING: 'generating', SAVING: 'saving', DONE: 'done', ERROR: 'error' }

export default function Descriptions() {
  const [skus, setSkus]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [texts, setTexts]       = useState({})   // productId -> text
  const [status, setStatus]     = useState({})   // productId -> STATUS
  const [batchRunning, setBatch] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [filterEmpty, setFilterEmpty] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    loadData()
    return () => { mounted.current = false }
  }, [])

  async function loadData() {
    setLoading(true)

    // Загружаем все SKU с описаниями и составом рецепта
    const { data: descData } = await supabase
      .from('product_descriptions')
      .select('id, product_id, description, generated_at, updated_at, products(id, article, name, type_id, recipe_id)')
      .order('products(article)')

    if (!mounted.current) return

    // Загружаем типы
    const { data: typesData } = await supabase
      .from('product_types')
      .select('id, name')

    const typeMap = {}
    ;(typesData ?? []).forEach(t => { typeMap[t.id] = t.name })

    // Загружаем ингредиенты для всех рецептов
    const recipeIds = [...new Set(
      (descData ?? [])
        .map(d => d.products?.recipe_id)
        .filter(Boolean)
    )]

    let ingredientsMap = {}
    if (recipeIds.length > 0) {
      const { data: ingData } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id, quantity, raw_materials(name), recipes!recipe_ingredients_sub_recipe_id_fkey(name)')
        .in('recipe_id', recipeIds)

      ;(ingData ?? []).forEach(ing => {
        const rId = ing.recipe_id
        if (!ingredientsMap[rId]) ingredientsMap[rId] = []
        const name = ing.raw_materials?.name ?? ing.recipes?.name ?? 'неизвестно'
        ingredientsMap[rId].push({ name, quantity: Number(ing.quantity) })
      })
    }

    const merged = (descData ?? []).map(d => ({
      descId:       d.id,
      productId:    d.product_id,
      article:      d.products?.article ?? '—',
      name:         d.products?.name ?? '—',
      typeId:       d.products?.type_id,
      typeName:     typeMap[d.products?.type_id] ?? 'Без категории',
      recipeId:     d.products?.recipe_id,
      description:  d.description ?? '',
      generatedAt:  d.generated_at,
      updatedAt:    d.updated_at,
      ingredients:  ingredientsMap[d.products?.recipe_id] ?? [],
    }))

    if (!mounted.current) return
    setSkus(merged)

    // Инициализируем тексты
    const t = {}
    merged.forEach(s => { t[s.productId] = s.description })
    setTexts(t)
    setLoading(false)
  }

  const filteredSkus = skus.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      s.article.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q)
    const matchEmpty = !filterEmpty || !texts[s.productId]
    return matchSearch && matchEmpty
  })

  const emptyCount = skus.filter(s => !texts[s.productId]).length

  async function generateOne(sku) {
    setStatus(p => ({ ...p, [sku.productId]: STATUS.GENERATING }))
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          sku_article: sku.article,
          product_name: sku.name,
          ingredients: sku.ingredients,
        }),
      })
      const json = await res.json()
      if (!mounted.current) return
      if (json.description) {
        setTexts(p => ({ ...p, [sku.productId]: json.description }))
        await saveOne(sku.productId, sku.descId, json.description)
      } else {
        setStatus(p => ({ ...p, [sku.productId]: STATUS.ERROR }))
      }
    } catch {
      if (mounted.current)
        setStatus(p => ({ ...p, [sku.productId]: STATUS.ERROR }))
    }
  }

  async function saveOne(productId, descId, text) {
    setStatus(p => ({ ...p, [productId]: STATUS.SAVING }))
    const { error } = await supabase
      .from('product_descriptions')
      .update({ description: text, updated_at: new Date().toISOString() })
      .eq('id', descId)

    if (!mounted.current) return
    if (error) {
      setStatus(p => ({ ...p, [productId]: STATUS.ERROR }))
    } else {
      setStatus(p => ({ ...p, [productId]: STATUS.DONE }))
      setTimeout(() => {
        if (mounted.current)
          setStatus(p => ({ ...p, [productId]: STATUS.IDLE }))
      }, 2000)
    }
  }

  async function handleSave(sku) {
    await saveOne(sku.productId, sku.descId, texts[sku.productId] ?? '')
  }

  async function batchGenerate() {
    const targets = filteredSkus.filter(s => !texts[s.productId])
    if (targets.length === 0) return
    setBatch(true)
    setBatchProgress({ done: 0, total: targets.length })

    for (const sku of targets) {
      if (!mounted.current) break
      await generateOne(sku)
      setBatchProgress(p => ({ ...p, done: p.done + 1 }))
      // небольшая задержка чтобы не перегружать API
      await new Promise(r => setTimeout(r, 300))
    }

    if (mounted.current) setBatch(false)
  }

  const StatusIcon = ({ productId }) => {
    const s = status[productId]
    if (s === STATUS.GENERATING || s === STATUS.SAVING)
      return <Loader2 size={14} className="text-gold animate-spin" />
    if (s === STATUS.DONE)
      return <CheckCircle2 size={14} className="text-green-400" />
    if (s === STATUS.ERROR)
      return <AlertCircle size={14} className="text-red-400" />
    return null
  }

  return (
    <div className="p-8">
      <PageHeader
        title="ОПИСАНИЯ"
        subtitle="Продающие описания для прайс-листа"
        action={
          <div className="flex items-center gap-2 text-muted text-xs font-body">
            <span className="text-cream">{skus.length}</span> SKU
            {emptyCount > 0 && (
              <span className="text-gold/70">· {emptyCount} без описания</span>
            )}
          </div>
        }
      />

      {/* Панель инструментов */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
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
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-cream transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        <button
          onClick={() => setFilterEmpty(p => !p)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-body transition-colors ${
            filterEmpty
              ? 'bg-gold/15 border-gold/30 text-gold'
              : 'border-forest-light/40 text-muted hover:text-cream'
          }`}
        >
          Только пустые {emptyCount > 0 && `(${emptyCount})`}
        </button>

        {emptyCount > 0 && !batchRunning && (
          <button
            onClick={batchGenerate}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/30
                       bg-gold/10 text-gold text-xs font-body font-medium
                       hover:bg-gold/20 hover:border-gold/50 transition-colors"
          >
            <Sparkles size={14} />
            Сгенерировать все пустые ({emptyCount})
          </button>
        )}

        {batchRunning && (
          <div className="flex items-center gap-2 text-gold text-xs font-mono">
            <Loader2 size={14} className="animate-spin" />
            {batchProgress.done} / {batchProgress.total}
          </div>
        )}

        <button
          onClick={loadData}
          className="p-2 rounded-lg border border-forest-light/40 text-muted hover:text-cream transition-colors"
          title="Обновить"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? (
        <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredSkus.length === 0 ? (
            <div className="card text-center py-12 text-muted text-sm font-body">
              {search ? `Ничего не найдено по запросу «${search}»` : 'Нет данных'}
            </div>
          ) : (
            filteredSkus.map(sku => {
              const text     = texts[sku.productId] ?? ''
              const s        = status[sku.productId] ?? STATUS.IDLE
              const hasText  = text.length > 0
              const isDirty  = text !== (sku.description ?? '')

              return (
                <div key={sku.productId}
                  className={`card transition-colors ${
                    hasText ? '' : 'border-forest-light/20 opacity-80'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Артикул + название */}
                    <div className="flex-shrink-0 w-44">
                      <span className="badge bg-gold/10 text-gold border border-gold/20 font-mono text-xs px-2 py-0.5 rounded">
                        {sku.article}
                      </span>
                      <div className="text-cream text-xs font-body mt-1 leading-tight">{sku.name}</div>
                      <div className="text-muted text-xs mt-0.5">{sku.typeName}</div>
                    </div>

                    {/* Текст описания */}
                    <div className="flex-1">
                      <textarea
                        value={text}
                        onChange={e => {
                          setTexts(p => ({ ...p, [sku.productId]: e.target.value }))
                          setStatus(p => ({ ...p, [sku.productId]: STATUS.IDLE }))
                        }}
                        placeholder="Нажмите «Сгенерировать» или введите описание вручную…"
                        rows={2}
                        className="w-full bg-forest-dark border border-forest-light/30 rounded-lg px-3 py-2
                                   text-cream text-sm font-body resize-none
                                   focus:outline-none focus:border-gold/50 placeholder:text-muted/50
                                   transition-colors"
                      />
                    </div>

                    {/* Кнопки */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => generateOne(sku)}
                        disabled={s === STATUS.GENERATING || s === STATUS.SAVING}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold/30
                                   bg-gold/10 text-gold text-xs font-body
                                   hover:bg-gold/20 hover:border-gold/50 transition-colors
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {(s === STATUS.GENERATING) ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Sparkles size={12} />
                        )}
                        Сгенерировать
                      </button>

                      <button
                        onClick={() => handleSave(sku)}
                        disabled={!isDirty || s === STATUS.SAVING || s === STATUS.GENERATING}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border
                                   text-xs font-body transition-colors
                                   disabled:opacity-40 disabled:cursor-not-allowed
                                   border-forest-light/40 text-muted hover:text-cream hover:border-forest-light/60"
                      >
                        {s === STATUS.SAVING ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : s === STATUS.DONE ? (
                          <CheckCircle2 size={12} className="text-green-400" />
                        ) : (
                          <Save size={12} />
                        )}
                        {s === STATUS.DONE ? 'Сохранено' : 'Сохранить'}
                      </button>
                    </div>

                    <div className="w-4 flex-shrink-0 flex items-center pt-2">
                      <StatusIcon productId={sku.productId} />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
