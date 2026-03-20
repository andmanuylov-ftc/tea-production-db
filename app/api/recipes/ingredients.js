/**
 * GET /api/recipes/ingredients?recipe_id=42
 * Состав рецепта с названиями ингредиентов
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { recipe_id } = req.query;
  if (!recipe_id) return res.status(400).json({ error: '?recipe_id= is required' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const url = `${SUPABASE_URL}/rest/v1/recipe_ingredients?recipe_id=eq.${recipe_id}&select=id,quantity,unit,material_id,sub_recipe_id,raw_materials(article,name),recipes!recipe_ingredients_sub_recipe_id_fkey(article,name)&order=id`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  return res.status(200).json({ recipe_id, count: data.length, ingredients: data });
}
