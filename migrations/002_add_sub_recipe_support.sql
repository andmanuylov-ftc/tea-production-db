-- Поддержка под-рецептов — 2026-03-08
ALTER TABLE recipe_ingredients
  ADD COLUMN sub_recipe_id UUID REFERENCES recipes(id),
  ALTER COLUMN material_id DROP NOT NULL;
ALTER TABLE recipe_ingredients
  ADD CONSTRAINT check_ingredient_source CHECK (
    (material_id IS NOT NULL AND sub_recipe_id IS NULL) OR
    (material_id IS NULL AND sub_recipe_id IS NOT NULL)
  );
