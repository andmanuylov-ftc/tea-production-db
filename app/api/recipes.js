/**
 * GET /api/recipes                          — все рецепты
 * GET /api/recipes?article=2306             — рецепт по артикулу
 * GET /api/recipes?id=42&ingredients=1      — состав рецепта
 * GET /api/costs?type=recipes               — себестоимость рецептов
 * GET /api/costs?type=sku                   — себестоимость SKU
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' };

  const { article, id, ingredients } = req.query;

  let url;
  if (id && ingredients) {
    // Состав рецепта
    url = `${SUPABASE_URL}/rest/v1/recipe_ingredients?recipe_id=eq.${id}&select=id,quantity,unit,material_id,sub_recipe_id,raw_materials(article,name)&order=id`;
  } else if (article) {
    url = `${SUPABASE_URL}/rest/v1/recipes?article=eq.${encodeURIComponent(article)}&select=id,article,name,output_quantity,output_unit,is_active,notes`;
  } else {
    url = `${SUPABASE_URL}/rest/v1/recipes?select=id,article,name,output_quantity,output_unit,is_active&order=article`;
  }

  const response = await fetch(url, { headers });
  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  return res.status(200).json({ count: Array.isArray(data) ? data.length : 1, data });
}
