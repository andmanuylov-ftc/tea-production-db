// GET /api/materials/5214%2F1
// Получить конкретное сырьё по точному артикулу
import { supabase } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { article } = req.query;

  try {
    const { data, error } = await supabase
      .from('raw_materials')
      .select(`
        id, article, name, unit, category_id,
        material_categories(name),
        material_prices(price, valid_from)
      `)
      .eq('article', article)
      .order('valid_from', { foreignTable: 'material_prices', ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ found: false, article });
    }

    res.status(200).json({ found: true, material: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
