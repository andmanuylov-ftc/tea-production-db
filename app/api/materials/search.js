/**
 * GET /api/materials/search?q=5214
 * Поиск сырья по артикулу или названию
 */
import { queryTable } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query param ?q= is required' });

  // Ищем по артикулу (точно) и по названию (частично)
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const url = `${SUPABASE_URL}/rest/v1/raw_materials?or=(article.ilike.*${encodeURIComponent(q)}*,name.ilike.*${encodeURIComponent(q)}*)&select=id,article,name,unit,category_id&order=article`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok) return res.status(500).json({ error: data.message || 'DB error' });

  return res.status(200).json({
    query: q,
    count: data.length,
    results: data,
  });
}
