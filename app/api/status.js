/**
 * GET /api/status
 * Проверка работоспособности API и подключения к БД
 * Claude вызывает этот эндпоинт в начале сессии для верификации
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let dbOk = false;
  let counts = {};

  try {
    // Быстрая проверка — считаем записи в ключевых таблицах
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

    counts = {
      raw_materials: mats.headers.get('content-range')?.split('/')[1] ?? '?',
      recipes: recipes.headers.get('content-range')?.split('/')[1] ?? '?',
      products: products.headers.get('content-range')?.split('/')[1] ?? '?',
    };
    dbOk = mats.ok;
  } catch (e) {
    counts.error = e.message;
  }

  return res.status(200).json({
    ok: dbOk,
    timestamp: new Date().toISOString(),
    supabase_url: SUPABASE_URL ? SUPABASE_URL.replace(/https:\/\/(.{8}).*/, 'https://$1...') : 'NOT SET',
    env_vars: {
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_KEY,
      API_SECRET: !!process.env.API_SECRET,
    },
    counts,
  });
}
