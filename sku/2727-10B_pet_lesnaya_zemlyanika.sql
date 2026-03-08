-- SKU: ПЭТ Лесная земляника
-- Артикул: 2727-10Б
-- Себестоимость: 92.98 руб (blend: 65.55, упаковка: 27.43)

INSERT INTO products (article, name, recipe_id, package_size, package_unit)
SELECT '2727-10Б', 'ПЭТ Лесная земляника', r.id, 0.120, 'кг'
FROM recipes r WHERE r.article = '2727';

INSERT INTO sku_recipe_components (product_id, recipe_id, quantity, unit)
SELECT p.id, r.id, 0.1200, 'кг'
FROM products p, recipes r
WHERE p.article = '2727-10Б' AND r.article = '2727';

INSERT INTO sku_recipe_components (product_id, material_id, quantity, unit)
SELECT p.id, rm.id, t.qty, t.unit
FROM products p
CROSS JOIN (VALUES
  ('8074/1',    1.0000, 'шт'),  -- Банка ПЭТ
  ('8074/2',    1.0000, 'шт'),  -- Крышка 1
  ('8074/3',    1.0000, 'шт'),  -- Крышка мет. 2
  ('5214-36',   1.0000, 'шт'),  -- Рекламная термо-наклейка Лесная земляника (40х207)
  ('5200',      0.1000, 'шт')   -- Этикетки 100*72 термо бумага
) AS t(article, qty, unit)
JOIN raw_materials rm ON rm.article = t.article
WHERE p.article = '2727-10Б';
