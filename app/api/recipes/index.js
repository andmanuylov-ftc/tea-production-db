/**
 * GET /api/recipes         — все рецепты
 * GET /api/recipes?article=2306  — конкретный рецепт
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { article } = req.query;
  const filter = article ? `&article=eq.${encodeURIComponent(article)}` : '';

  const url = `${SUPABASE_URL}/rest/v1/recipes?select=id,article,name,output_quantity,output_unit,is_active${filter}&order=article`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  return res.status(200).json({ count: data.length, recipes: data });
}
