// GET /api/recipes/123       — рецепт по id
// GET /api/recipes/2105      — рецепт по артикулу (если не число)
import { supabase } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id } = req.query;
  const isNumericId = /^\d+$/.test(id);

  try {
    const column = isNumericId ? 'id' : 'article';
    const value = isNumericId ? parseInt(id) : id;

    const { data: recipes, error: rErr } = await supabase
      .from('recipes')
      .select('id, article, name, description, output_quantity, output_unit, notes, is_active')
      .eq(column, value);

    if (rErr) throw rErr;
    if (!recipes || recipes.length === 0) {
      return res.status(404).json({ found: false });
    }

    const recipe = recipes[0];

    // Загружаем состав рецепта
    const { data: ingredients, error: iErr } = await supabase
      .from('recipe_ingredients')
      .select(`
        id, quantity, unit,
        raw_materials(id, article, name),
        sub_recipe:recipes!recipe_ingredients_sub_recipe_id_fkey(id, article, name)
      `)
      .eq('recipe_id', recipe.id);

    if (iErr) throw iErr;

    // Загружаем себестоимость из view
    const { data: cost } = await supabase
      .from('recipe_cost')
      .select('total_cost, cost_per_kg')
      .eq('recipe_id', recipe.id)
      .single();

    res.status(200).json({
      found: true,
      recipe,
      ingredients: ingredients || [],
      cost: cost || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
