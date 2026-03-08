-- Миграция 001: Начальная схема
-- Категории сырья
CREATE TABLE material_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Сырьё и материалы
CREATE TABLE raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article text UNIQUE NOT NULL,
  name text NOT NULL,
  category_id uuid REFERENCES material_categories(id),
  unit text NOT NULL CHECK (unit IN ('кг', 'шт')),
  supplier text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Цены на сырьё (с историей)
CREATE TABLE material_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES raw_materials(id),
  price_per_unit numeric(12,2) NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  created_at timestamptz DEFAULT now()
);

-- Рецепты (выход 1 кг)
CREATE TABLE recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article text UNIQUE NOT NULL,
  name text NOT NULL,
  output_quantity numeric(10,3) DEFAULT 1.000,
  output_unit text DEFAULT 'кг',
  created_at timestamptz DEFAULT now()
);

-- Состав рецепта
CREATE TABLE recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid REFERENCES recipes(id),
  material_id uuid REFERENCES raw_materials(id),
  quantity numeric(10,4) NOT NULL,
  unit text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Готовая продукция / SKU
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article text UNIQUE NOT NULL,
  name text NOT NULL,
  recipe_id uuid REFERENCES recipes(id),
  package_size numeric(10,3),
  package_unit text,
  created_at timestamptz DEFAULT now()
);

-- Состав SKU
CREATE TABLE sku_recipe_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  recipe_id uuid REFERENCES recipes(id),
  material_id uuid REFERENCES raw_materials(id),
  quantity numeric(10,4) NOT NULL,
  unit text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Прайслисты
CREATE TABLE price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  markup_percent numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Позиции прайслиста
CREATE TABLE price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid REFERENCES price_lists(id),
  product_id uuid REFERENCES products(id),
  price numeric(12,2),
  override_markup_percent numeric(5,2),
  created_at timestamptz DEFAULT now()
);
