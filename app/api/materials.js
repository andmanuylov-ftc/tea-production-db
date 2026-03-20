/**
 * GET /api/materials?search=5214          — поиск по артикулу или названию
 * GET /api/materials?article=5214/1       — точный поиск по артикулу
 * GET /api/materials                      — все материалы (первые 100)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' };

  const { search, article } = req.query;

  let url;
  if (article) {
    // Точный поиск по артикулу
    url = `${SUPABASE_URL}/rest/v1/raw_materials?article=eq.${encodeURIComponent(article)}&select=id,article,name,unit,category_id`;
  } else if (search) {
    // Поиск по артикулу или названию
    url = `${SUPABASE_URL}/rest/v1/raw_materials?or=(article.ilike.*${encodeURIComponent(search)}*,name.ilike.*${encodeURIComponent(search)}*)&select=id,article,name,unit,category_id&order=article&limit=50`;
  } else {
    url = `${SUPABASE_URL}/rest/v1/raw_materials?select=id,article,name,unit,category_id&order=article&limit=100`;
  }

  const response = await fetch(url, { headers });
  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  if (article) {
    return res.status(200).json({ found: data.length > 0, article, result: data[0] || null });
  }
  return res.status(200).json({ count: data.length, results: data });
}
