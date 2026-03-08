-- Рецепт: Лесная земляника
-- Артикул: 2727
-- Выход: 1 кг
-- Себестоимость: 546.23 руб/кг (на 07.03.2026)

INSERT INTO recipes (article, name, output_quantity, output_unit)
VALUES ('2727', 'Лесная земляника', 1.000, 'кг');

-- Под-рецепт 4101
INSERT INTO recipe_ingredients (recipe_id, sub_recipe_id, quantity, unit)
SELECT r.id, sr.id, 0.6500, 'кг'
FROM recipes r, recipes sr
WHERE r.article = '2727' AND sr.article = '4101';

-- Сырьё
INSERT INTO recipe_ingredients (recipe_id, material_id, quantity, unit)
SELECT r.id, rm.id, t.qty, 'кг'
FROM recipes r
CROSS JOIN (VALUES
  ('2470',   0.1000),  -- Барбарис ягода
  ('2474',   0.1000),  -- Ананас цукаты 3-5мм (зеленые)
  ('2613/2', 0.0700),  -- Зеленый лёд
  ('2469',   0.0400),  -- Брусника лист целый
  ('2586',   0.0300),  -- Земляника 2586 (08741)
  ('2641',   0.0150)   -- Клубника сушеная с плодоножкой
) AS t(article, qty)
JOIN raw_materials rm ON rm.article = t.article
WHERE r.article = '2727';
