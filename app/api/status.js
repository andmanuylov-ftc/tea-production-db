/**
 * GET /api/status
 * Health check + DB connection verification
 * Includes full endpoint URLs so Claude can fetch them via web_fetch
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const BASE = 'https://tea-production-db.vercel.app';

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({
      ok: false,
      error: 'Missing env vars',
      env_vars: {
        SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_KEY,
        API_SECRET: !!process.env.API_SECRET,
      }
    });
  }

  try {
    const [mats, recipes, products] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/raw_materials?select=count`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'count=exact', 'Accept': 'application/json' },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/recipes?select=count`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'count=exact', 'Accept': 'application/json' },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/products?select=count`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'count=exact', 'Accept': 'application/json' },
      }),
    ]);

    return res.status(200).json({
      ok: mats.ok,
      timestamp: new Date().toISOString(),
      env_vars: {
        SUPABASE_URL: true,
        SUPABASE_SERVICE_ROLE_KEY: true,
        API_SECRET: !!process.env.API_SECRET,
      },
      counts: {
        raw_materials: mats.headers.get('content-range')?.split('/')[1] ?? '?',
        recipes: recipes.headers.get('content-range')?.split('/')[1] ?? '?',
        products: products.headers.get('content-range')?.split('/')[1] ?? '?',
      },
      endpoints: {
        status:           `${BASE}/api/status`,
        materials:        `${BASE}/api/materials`,
        materials_search: `${BASE}/api/materials?search=`,
        materials_article:`${BASE}/api/materials?article=`,
        recipes:          `${BASE}/api/recipes`,
        recipes_article:  `${BASE}/api/recipes?article=`,
        recipes_id:       `${BASE}/api/recipes?id=`,
        recipes_ingr:     `${BASE}/api/recipes?id=&ingredients=1`,
        sku:              `${BASE}/api/sku`,
        sku_article:      `${BASE}/api/sku?article=`,
        sku_costs:        `${BASE}/api/sku?costs=1`,
        sku_recipe_costs: `${BASE}/api/sku?recipe_costs=1`,
      },
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
