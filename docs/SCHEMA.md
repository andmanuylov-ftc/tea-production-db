# Схема базы данных

## Таблицы

### material_categories
Категории сырья и материалов.

### raw_materials
Сырьё и материалы (442 позиции).
- `article` UNIQUE — артикул
- `name` — наименование
- `category_id` — категория
- `unit` — единица измерения (кг или шт)
- `supplier` — поставщик
- `is_active` — активна ли позиция

### material_prices
История цен на сырьё.
- `material_id` — ссылка на raw_materials
- `price_per_unit` — цена в рублях
- `valid_from` — дата начала действия цены
- `valid_to` — дата окончания (NULL = актуальная)

### recipes
Рецепты купажей (выход 1 кг).
- `article` UNIQUE — артикул рецепта
- `name` — наименование
- `output_quantity` — объём выхода
- `output_unit` — единица выхода

### recipe_ingredients
Состав рецепта. Каждая строка — либо сырьё, либо под-рецепт.
- `recipe_id` — ссылка на recipes
- `material_id` — ссылка на raw_materials (NULL если под-рецепт)
- `sub_recipe_id` — ссылка на recipes (NULL если сырьё)
- `quantity` — количество
- `unit` — единица

### products
Готовая продукция / SKU.
- `article` UNIQUE — артикул SKU
- `name` — наименование
- `recipe_id` — ссылка на recipes (основной купаж)
- `package_size` — объём упаковки
- `package_unit` — единица упаковки

### sku_recipe_components
Состав SKU: купаж + упаковочные материалы.
- `product_id` — ссылка на products
- `recipe_id` — ссылка на recipes (для купажа)
- `material_id` — ссылка на raw_materials (для упаковки)
- `quantity` — количество
- `unit` — единица

### price_lists
Прайслисты с наценкой.
- `name` — название прайслиста
- `markup_percent` — наценка по умолчанию

### price_list_items
Позиции прайслиста.
- `price_list_id` — ссылка на price_lists
- `product_id` — ссылка на products
- `price` — цена
- `override_markup_percent` — индивидуальная наценка

## Views

### recipe_cost
Себестоимость рецепта 1 кг по актуальным ценам. Рекурсивная (WITH RECURSIVE) — раскрывает под-рецепты.

### sku_cost
Себестоимость SKU = blend_cost + packaging_cost.

### product_pricing
Финальные цены с наценкой по прайслистам.
