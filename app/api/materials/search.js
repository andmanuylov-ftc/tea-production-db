// GET /api/materials/search?q=5214
// GET /api/materials/search?q=бергамот
// Поиск сырья по артикулу или названию
import { supabase } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Параметр q обязателен' });
  }

  try {
    const { data, error } = await supabase
      .from('raw_materials')
      .select('id, article, name, unit, category_id')
      .or(`article.ilike.%${q}%,name.ilike.%${q}%`)
      .order('article');

    if (error) throw error;

    res.status(200).json({
      query: q,
      count: data.length,
      results: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
