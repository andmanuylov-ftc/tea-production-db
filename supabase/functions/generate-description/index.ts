import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { sku_article, product_name, ingredients } = body

    if (!product_name) {
      return new Response(JSON.stringify({ error: 'product_name required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ingredientList = (ingredients ?? [])
      .map((i: any) => `${i.name} (${(Number(i.quantity) * 1000).toFixed(0)} г/кг)`)
      .join(', ')

    const prompt = `Ты копирайтер чайной компании ПЧК/ADDIS. Напиши продающее описание для прайс-листа.

Товар: ${product_name}
Артикул: ${sku_article}
Состав: ${ingredientList || 'не указан'}

Требования:
- Ровно 1-2 предложения
- Продающий, поэтический стиль
- Акцент на вкусе, аромате или уникальности
- Только русский язык
- Никаких заголовков, скобок, кавычек, лишних символов — просто текст
- Без упоминания артикула и бренда

Опиши товар:`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Anthropic error ${response.status}: ${responseText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = JSON.parse(responseText)
    const description = data.content?.[0]?.text?.trim() ?? ''

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
