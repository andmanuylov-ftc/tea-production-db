-- SKU 2727-ПА500: Лесная земляника 500 гр
INSERT INTO products (article, name, recipe_id, package_size, package_unit)
SELECT '2727-ПА500', 'Лесная земляника, 500 гр', r.id, 500, 'г'
FROM recipes r WHERE r.article = '2727';
INSERT INTO sku_recipe_components (product_id, recipe_id, quantity, unit)
SELECT p.id, r.id, 0.5000, 'кг'
FROM products p, recipes r
WHERE p.article = '2727-ПА500' AND r.article = '2727';
INSERT INTO sku_recipe_components (product_id, material_id, quantity, unit)
SELECT p.id, rm.id, t.qty, t.unit
FROM products p
CROSS JOIN (VALUES
  ('5300-440-мет-стд', 0.0120, 'кг'),
  ('5200', 1.0000, 'шт'), ('5200/2', 6.0000, 'шт')
) AS t(article, qty, unit)
JOIN raw_materials rm ON rm.article = t.article
WHERE p.article = '2727-ПА500';
