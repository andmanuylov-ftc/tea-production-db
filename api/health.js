// GET /api/health
// Проверка соединения с БД. Claude вызывает это в начале сессии.
import { supabase } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { count, error } = await supabase
      .from('raw_materials')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    res.status(200).json({
      status: 'ok',
      db: 'connected',
      raw_materials_count: count,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}
