// GET /api/costs             — себестоимость всех рецептов и SKU
// GET /api/costs?type=recipe — только рецепты
// GET /api/costs?type=sku    — только SKU
import { supabase } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const type = req.query.type || 'all';

  try {
    const result = {};

    if (type === 'all' || type === 'recipe') {
      const { data, error } = await supabase
        .from('recipe_cost')
        .select('recipe_id, recipe_article, recipe_name, total_cost, cost_per_kg')
        .order('recipe_article');
      if (error) throw error;
      result.recipes = data;
    }

    if (type === 'all' || type === 'sku') {
      const { data, error } = await supabase
        .from('sku_cost')
        .select('product_id, sku_article, product_name, package_size, blend_cost, packaging_cost, total_sku_cost')
        .order('sku_article');
      if (error) throw error;
      result.sku = data;
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
