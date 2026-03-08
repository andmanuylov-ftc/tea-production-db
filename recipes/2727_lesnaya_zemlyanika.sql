-- Рецепт 2727: Лесная земляника (1 кг, себестоимость 657.54 руб/кг)
INSERT INTO recipes (article, name, output_quantity, output_unit)
VALUES ('2727', 'Лесная земляника', 1.000, 'кг');
INSERT INTO recipe_ingredients (recipe_id, sub_recipe_id, quantity, unit)
SELECT r.id, r2.id, 0.6500, 'кг'
FROM recipes r, recipes r2
WHERE r.article = '2727' AND r2.article = '4101';
INSERT INTO recipe_ingredients (recipe_id, material_id, quantity, unit)
SELECT r.id, rm.id, t.qty, 'кг'
FROM recipes r
CROSS JOIN (VALUES
  ('2469', 0.0400), ('2470', 0.1000), ('2474', 0.1000),
  ('2586', 0.0300), ('2613/2', 0.0700), ('2641', 0.0150)
) AS t(article, qty)
JOIN raw_materials rm ON rm.article = t.article
WHERE r.article = '2727';
