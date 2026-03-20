/**
 * POST /api/db/query
 * Произвольный SQL-запрос (только SELECT) через Supabase RPC
 *
 * Body: { "sql": "SELECT * FROM raw_materials WHERE article = '5214/1'" }
 * Header: x-api-key: <API_SECRET из Vercel env>
 *
 * ЗАЩИТА: принимает только SELECT-запросы
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Проверка API-ключа
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'Body must contain { sql }' });

  // Разрешаем только SELECT
  const trimmed = sql.trim().toLowerCase();
  if (!trimmed.startsWith('select') && !trimmed.startsWith('with')) {
    return res.status(403).json({ error: 'Only SELECT queries are allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Используем Supabase RPC для выполнения SQL
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_select`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const data = await response.json();
  if (!response.ok) {
    // Fallback: попробовать через PostgREST напрямую сообщить ошибку
    return res.status(500).json({ error: data.message || JSON.stringify(data), sql });
  }

  return res.status(200).json({ ok: true, count: Array.isArray(data) ? data.length : null, data });
}
