-- Начальная схема БД — 2026-03-08
CREATE TABLE material_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL, description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  unit TEXT NOT NULL, category_id UUID REFERENCES material_categories,
  supplier TEXT, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE material_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES raw_materials,
  price_per_unit NUMERIC NOT NULL, valid_from DATE NOT NULL,
  valid_to DATE, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  output_quantity NUMERIC DEFAULT 1, output_unit TEXT DEFAULT 'кг',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes,
  material_id UUID REFERENCES raw_materials,
  quantity NUMERIC NOT NULL, unit TEXT NOT NULL
);
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  recipe_id UUID REFERENCES recipes, package_size NUMERIC,
  package_unit TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE sku_recipe_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products,
  recipe_id UUID REFERENCES recipes,
  material_id UUID REFERENCES raw_materials,
  quantity NUMERIC NOT NULL, unit TEXT NOT NULL
);
CREATE TABLE price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, markup_percent NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID REFERENCES price_lists,
  product_id UUID REFERENCES products,
  price NUMERIC, override_markup_percent NUMERIC
);
