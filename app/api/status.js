/**
 * GET /api/status
 * Health check + DB connection verification
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

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
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
