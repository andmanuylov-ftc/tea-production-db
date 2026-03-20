// Shared Supabase client for all API routes
// Uses SUPABASE_SERVICE_ROLE_KEY (не протухает, хранится в Vercel env vars)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

/**
 * Выполняет произвольный SELECT через Supabase REST API
 * @param {string} sql
 * @returns {Promise<{data: any[], error: string|null}>}
 */
export async function runQuery(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const json = await res.json();
  if (!res.ok) return { data: null, error: json.message || JSON.stringify(json) };
  return { data: json, error: null };
}

/**
 * Запрос к таблице через Supabase PostgREST
 * @param {string} table
 * @param {Record<string,string>} params  — query params (select, eq.*, order, limit)
 */
export async function queryTable(table, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });
  const json = await res.json();
  if (!res.ok) return { data: null, error: json.message || JSON.stringify(json) };
  return { data: json, error: null };
}
