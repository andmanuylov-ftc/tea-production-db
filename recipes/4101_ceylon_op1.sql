-- Рецепт: Цейлон OP1 (базовый купаж)
-- Артикул: 4101
-- Выход: 1 кг
-- Себестоимость: 382.94 руб/кг (на 07.03.2026)

INSERT INTO recipes (article, name, output_quantity, output_unit)
VALUES ('4101', 'Цейлон OP1', 1.000, 'кг');

INSERT INTO recipe_ingredients (recipe_id, material_id, quantity, unit)
SELECT r.id, rm.id, t.qty, 'кг'
FROM recipes r
CROSS JOIN (VALUES
  ('4101/3', 0.7000),  -- Кенийский черный чай FOP 1320
  ('4400/1', 0.3000)   -- Вьетнамский чай ОР
) AS t(article, qty)
JOIN raw_materials rm ON rm.article = t.article
WHERE r.article = '4101';
