// GET /api/recipes          — список всех рецептов
// GET /api/recipes?active=1 — только активные
import { supabase } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    let query = supabase
      .from('recipes')
      .select('id, article, name, output_quantity, output_unit, is_active, notes')
      .order('article');

    if (req.query.active === '1') {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ count: data.length, recipes: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
