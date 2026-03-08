# Схема базы данных

## material_categories
id UUID PK, name TEXT UNIQUE, description TEXT

## raw_materials
id UUID PK, article TEXT UNIQUE, name TEXT, unit TEXT (кг/шт), category_id UUID FK, supplier TEXT, is_active BOOLEAN

## material_prices
id UUID PK, material_id UUID FK, price_per_unit NUMERIC (руб), valid_from DATE, valid_to DATE (NULL=актуальная)

## recipes
id UUID PK, article TEXT UNIQUE, name TEXT, output_quantity NUMERIC, output_unit TEXT

## recipe_ingredients
id UUID PK, recipe_id UUID FK, material_id UUID FK (или NULL), sub_recipe_id UUID FK (или NULL), quantity NUMERIC, unit TEXT
CONSTRAINT: либо material_id, либо sub_recipe_id

## products (SKU)
id UUID PK, article TEXT UNIQUE, name TEXT, recipe_id UUID FK, package_size NUMERIC, package_unit TEXT

## sku_recipe_components
id UUID PK, product_id UUID FK, recipe_id UUID FK (или NULL), material_id UUID FK (или NULL), quantity NUMERIC, unit TEXT

## price_lists
id UUID PK, name TEXT, markup_percent NUMERIC

## price_list_items
id UUID PK, price_list_id UUID FK, product_id UUID FK, price NUMERIC, override_markup_percent NUMERIC
