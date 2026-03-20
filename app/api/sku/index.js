/**
 * GET /api/sku          — все SKU
 * GET /api/sku?article=2306-ПА500  — конкретный SKU
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { article } = req.query;
  const filter = article ? `&article=eq.${encodeURIComponent(article)}` : '';

  const url = `${SUPABASE_URL}/rest/v1/products?select=id,article,name,type_id,package_size,package_unit,recipe_id${filter}&order=article`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  return res.status(200).json({ count: data.length, sku: data });
}
