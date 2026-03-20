// GET /api/sku/123          — SKU по id
// GET /api/sku/2105-10      — SKU по артикулу
import { supabase } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id } = req.query;
  const isNumericId = /^\d+$/.test(id);

  try {
    const column = isNumericId ? 'id' : 'article';
    const value = isNumericId ? parseInt(id) : id;

    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id, article, name, package_size, package_unit, type_id,
        product_types(name),
        recipes(id, article, name)
      `)
      .eq(column, value);

    if (error) throw error;
    if (!products || products.length === 0) {
      return res.status(404).json({ found: false });
    }

    const product = products[0];

    // Состав SKU
    const { data: components } = await supabase
      .from('sku_recipe_components')
      .select(`
        id, quantity, unit,
        raw_materials(id, article, name)
      `)
      .eq('product_id', product.id);

    // Себестоимость из view
    const { data: cost } = await supabase
      .from('sku_cost')
      .select('blend_cost, packaging_cost, total_sku_cost')
      .eq('product_id', product.id)
      .single();

    res.status(200).json({
      found: true,
      sku: product,
      components: components || [],
      cost: cost || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
