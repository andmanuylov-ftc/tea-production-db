-- Миграция 002: Поддержка под-рецептов
-- Добавляем sub_recipe_id в recipe_ingredients
ALTER TABLE recipe_ingredients
  ADD COLUMN sub_recipe_id uuid REFERENCES recipes(id),
  ALTER COLUMN material_id DROP NOT NULL;

-- Ограничение: либо material_id, либо sub_recipe_id
ALTER TABLE recipe_ingredients
  ADD CONSTRAINT check_ingredient_type
  CHECK (
    (material_id IS NOT NULL AND sub_recipe_id IS NULL) OR
    (material_id IS NULL AND sub_recipe_id IS NOT NULL)
  );
