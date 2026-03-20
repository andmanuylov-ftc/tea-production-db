/**
 * GET /api/materials/by-article?article=5214/1
 * Точный поиск по артикулу
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { article } = req.query;
  if (!article) return res.status(400).json({ error: 'Query param ?article= is required' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const url = `${SUPABASE_URL}/rest/v1/raw_materials?article=eq.${encodeURIComponent(article)}&select=id,article,name,unit,category_id`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  if (data.length === 0) {
    return res.status(200).json({ found: false, article, result: null });
  }
  return res.status(200).json({ found: true, article, result: data[0] });
}
