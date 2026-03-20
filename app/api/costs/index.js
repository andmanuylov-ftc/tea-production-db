/**
 * GET /api/costs/recipes   — себестоимость всех рецептов
 * GET /api/costs/sku       — себестоимость всех SKU
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { type } = req.query; // 'recipes' or 'sku'
  const view = type === 'sku' ? 'sku_cost' : 'recipe_cost';

  const url = `${SUPABASE_URL}/rest/v1/${view}?select=*&order=recipe_article`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  return res.status(200).json({ view, count: data.length, data });
}
