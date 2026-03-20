/**
 * GET /api/sku                              — все SKU
 * GET /api/sku?article=2306-ПА500           — конкретный SKU
 * GET /api/sku?costs=1                      — себестоимость SKU
 * GET /api/sku?recipe_costs=1               — себестоимость рецептов
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' };

  const { article, costs, recipe_costs } = req.query;

  let url;
  if (recipe_costs) {
    url = `${SUPABASE_URL}/rest/v1/recipe_cost?select=*&order=recipe_article`;
  } else if (costs) {
    url = `${SUPABASE_URL}/rest/v1/sku_cost?select=*&order=sku_article`;
  } else if (article) {
    url = `${SUPABASE_URL}/rest/v1/products?article=eq.${encodeURIComponent(article)}&select=id,article,name,type_id,package_size,package_unit,recipe_id`;
  } else {
    url = `${SUPABASE_URL}/rest/v1/products?select=id,article,name,type_id,package_size,package_unit,recipe_id&order=article`;
  }

  const response = await fetch(url, { headers });
  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  return res.status(200).json({ count: Array.isArray(data) ? data.length : 1, data });
}
