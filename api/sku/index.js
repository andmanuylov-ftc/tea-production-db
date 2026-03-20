// GET /api/sku              — список всех SKU
// GET /api/sku?type_id=38   — фильтр по типу
import { supabase } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    let query = supabase
      .from('products')
      .select(`
        id, article, name, package_size, package_unit, type_id,
        product_types(name),
        recipes(article, name)
      `)
      .order('article');

    if (req.query.type_id) {
      query = query.eq('type_id', parseInt(req.query.type_id));
    }

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ count: data.length, sku: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
