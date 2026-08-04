-- =====================================================================
-- 02_schema_update_20260804.sql
-- Догоняем схему timeweb до состояния мастера Supabase на 04.08.2026:
--   + 4 таблицы: pricelist_sections, pricelist_subsections,
--                product_pricelist_position, recipe_clients
--   + колонка raw_materials.tea_type
--   + функция pchk_clean_material_name
--   + пересоздание всех 8 бизнес-вьюх (актуальные определения мастера)
-- Применено на сервере 04.08.2026.
-- Применять: psql -d tea_production -v ON_ERROR_STOP=1 -f <файл>
-- =====================================================================
SET search_path = public;
SET ROLE tea;

BEGIN;

-- ---------- Новые таблицы (таксономия прайса, 12.07.2026) ----------

CREATE TABLE IF NOT EXISTS pricelist_sections (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  sort_order  integer NOT NULL
);

CREATE TABLE IF NOT EXISTS pricelist_subsections (
  id          serial PRIMARY KEY,
  section_id  integer NOT NULL REFERENCES pricelist_sections(id) ON DELETE CASCADE,
  code        text,
  name        text,
  sort_order  integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS pricelist_subsections_uq
  ON pricelist_subsections (section_id, COALESCE(name, ''));

CREATE TABLE IF NOT EXISTS product_pricelist_position (
  product_id    uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  subsection_id integer NOT NULL REFERENCES pricelist_subsections(id) ON DELETE RESTRICT,
  group_name    text,
  sort_order    integer NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppp_subsection_idx
  ON product_pricelist_position (subsection_id, sort_order);

-- ---------- recipe_clients (21.07.2026) ----------

CREATE TABLE IF NOT EXISTS recipe_clients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_clients_recipe_client_uk UNIQUE (recipe_id, client_id)
);
CREATE INDEX IF NOT EXISTS recipe_clients_recipe_id_idx ON recipe_clients (recipe_id);
CREATE INDEX IF NOT EXISTS recipe_clients_client_id_idx ON recipe_clients (client_id);

-- ---------- raw_materials.tea_type (12.07.2026) ----------

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS tea_type text;

-- ---------- Функция чистки названий сырья ----------

CREATE OR REPLACE FUNCTION pchk_clean_material_name(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with s0 as (select regexp_replace(regexp_replace(coalesce(txt,''), '\([^)]*\)', ' ', 'g'), '"[^"]*"', ' ', 'g') as t),
  s1 as (select regexp_replace(t, '(^|[[:space:]])[0-9]+([./-][0-9]+)*[[:space:]]*(мм|мл|см)?($|[[:space:]])', ' ', 'g') as t from s0),
  s2 as (select regexp_replace(t, '(^|[[:space:]])[0-9]+([./-][0-9]+)*[[:space:]]*(мм|мл|см)?($|[[:space:]])', ' ', 'g') as t from s1),
  s3 as (select regexp_replace(t, '(^|[[:space:]])[0-9]+([./-][0-9]+)*[[:space:]]*(мм|мл|см)?($|[[:space:]])', ' ', 'g') as t from s2)
  select btrim(regexp_replace(regexp_replace(t, '[[:space:]]+', ' ', 'g'), '^[[:space:],.-]+|[[:space:],.-]+$', '', 'g')) from s3
$function$;

-- ---------- Пересоздание вьюх (порядок зависимостей) ----------

DROP VIEW IF EXISTS
  pricelist_export_v1,
  manager_pricelist_v1,
  product_pricing,
  sku_composition_v1,
  ozon_sku_costs_v,
  sku_cost,
  recipe_cost,
  raw_materials_with_price
CASCADE;

CREATE VIEW raw_materials_with_price AS
 SELECT rm.id,
    rm.article,
    rm.name,
    rm.unit,
    rm.category_id,
    mp.price_per_unit AS current_price,
    mp.valid_from AS price_date
   FROM raw_materials rm
     LEFT JOIN LATERAL ( SELECT material_prices.price_per_unit,
            material_prices.valid_from
           FROM material_prices
          WHERE material_prices.material_id = rm.id
          ORDER BY material_prices.valid_from DESC
         LIMIT 1) mp ON true;

CREATE VIEW recipe_cost AS
 WITH RECURSIVE recipe_tree AS (
         SELECT ri.recipe_id,
            ri.material_id,
            ri.sub_recipe_id,
            ri.quantity::numeric AS qty_multiplier
           FROM recipe_ingredients ri
        UNION ALL
         SELECT rt_1.recipe_id,
            ri2.material_id,
            ri2.sub_recipe_id,
            rt_1.qty_multiplier * ri2.quantity::numeric AS qty_multiplier
           FROM recipe_tree rt_1
             JOIN recipe_ingredients ri2 ON ri2.recipe_id = rt_1.sub_recipe_id
          WHERE rt_1.sub_recipe_id IS NOT NULL
        )
 SELECT r.id AS recipe_id,
    r.article AS recipe_article,
    r.name AS recipe_name,
    r.output_quantity,
    r.output_unit,
    sum(rt.qty_multiplier * COALESCE(( SELECT mp.price_per_unit
           FROM material_prices mp
          WHERE mp.material_id = rt.material_id AND mp.valid_from <= CURRENT_DATE AND (mp.valid_to IS NULL OR mp.valid_to >= CURRENT_DATE)
          ORDER BY mp.valid_from DESC
         LIMIT 1), 0::numeric)) AS total_cost,
    sum(rt.qty_multiplier * COALESCE(( SELECT mp.price_per_unit
           FROM material_prices mp
          WHERE mp.material_id = rt.material_id AND mp.valid_from <= CURRENT_DATE AND (mp.valid_to IS NULL OR mp.valid_to >= CURRENT_DATE)
          ORDER BY mp.valid_from DESC
         LIMIT 1), 0::numeric)) / NULLIF(r.output_quantity, 0::numeric) AS cost_per_kg
   FROM recipes r
     JOIN recipe_tree rt ON rt.recipe_id = r.id
  WHERE rt.material_id IS NOT NULL
  GROUP BY r.id, r.article, r.name, r.output_quantity, r.output_unit;

CREATE VIEW sku_cost AS
 SELECT p.id AS product_id,
    p.article AS sku_article,
    p.name AS product_name,
    p.package_size,
    p.package_unit,
    COALESCE(sum(
        CASE
            WHEN src.recipe_id IS NOT NULL THEN src.quantity * (( SELECT rc.cost_per_kg
               FROM recipe_cost rc
              WHERE rc.recipe_id = src.recipe_id))
            ELSE NULL::numeric
        END), 0::numeric) AS blend_cost,
    COALESCE(sum(
        CASE
            WHEN src.material_id IS NOT NULL THEN src.quantity * COALESCE(( SELECT mp.price_per_unit
               FROM material_prices mp
              WHERE mp.material_id = src.material_id AND mp.valid_from <= CURRENT_DATE AND (mp.valid_to IS NULL OR mp.valid_to >= CURRENT_DATE)
              ORDER BY mp.valid_from DESC
             LIMIT 1), 0::numeric)
            ELSE NULL::numeric
        END), 0::numeric) AS packaging_cost,
    COALESCE(sum(
        CASE
            WHEN src.recipe_id IS NOT NULL THEN src.quantity * (( SELECT rc.cost_per_kg
               FROM recipe_cost rc
              WHERE rc.recipe_id = src.recipe_id))
            ELSE NULL::numeric
        END), 0::numeric) + COALESCE(sum(
        CASE
            WHEN src.material_id IS NOT NULL THEN src.quantity * COALESCE(( SELECT mp.price_per_unit
               FROM material_prices mp
              WHERE mp.material_id = src.material_id AND mp.valid_from <= CURRENT_DATE AND (mp.valid_to IS NULL OR mp.valid_to >= CURRENT_DATE)
              ORDER BY mp.valid_from DESC
             LIMIT 1), 0::numeric)
            ELSE NULL::numeric
        END), 0::numeric) AS total_sku_cost
   FROM products p
     JOIN sku_recipe_components src ON src.product_id = p.id
  GROUP BY p.id, p.article, p.name, p.package_size, p.package_unit;

CREATE VIEW product_pricing AS
 SELECT p.id AS product_id,
    p.article AS sku_article,
    p.name AS product_name,
    p.package_size,
    p.package_unit,
    sc.total_sku_cost,
    pl.id AS price_list_id,
    pl.name AS price_list_name,
    COALESCE(pli.override_markup_percent, pl.markup_percent) AS markup_percent,
    COALESCE(pli.price, round(sc.total_sku_cost * (1::numeric + COALESCE(pli.override_markup_percent, pl.markup_percent) / 100::numeric), 2)) AS final_price
   FROM products p
     JOIN sku_cost sc ON sc.product_id = p.id
     CROSS JOIN price_lists pl
     LEFT JOIN price_list_items pli ON pli.product_id = p.id AND pli.price_list_id = pl.id;

CREATE VIEW manager_pricelist_v1 AS
 SELECT p.id AS product_id,
    p.article AS sku_article,
    p.name AS sku_name,
    p.photo_url,
    p.package_size,
    p.package_unit,
    pt.name AS category_name,
    round(sc.total_sku_cost * 2.70)::integer AS price_base,
    round(sc.total_sku_cost * 2.50)::integer AS price_opt,
    round(sc.total_sku_cost * 2.30)::integer AS price_opt_plus,
    round(sc.total_sku_cost * 2.10)::integer AS price_partner,
    round(sc.total_sku_cost * 1.95)::integer AS price_key_partner
   FROM products p
     LEFT JOIN product_types pt ON pt.id = p.type_id
     LEFT JOIN sku_cost sc ON sc.product_id = p.id
  WHERE p.is_active = true AND sc.total_sku_cost IS NOT NULL;

CREATE VIEW sku_composition_v1 AS
 WITH RECURSIVE expand AS (
         SELECT src.product_id,
            ri.material_id,
            ri.sub_recipe_id,
            ri.quantity::numeric AS qty
           FROM sku_recipe_components src
             JOIN recipe_ingredients ri ON ri.recipe_id = src.recipe_id
          WHERE src.recipe_id IS NOT NULL
        UNION ALL
         SELECT e.product_id,
            ri.material_id,
            ri.sub_recipe_id,
            e.qty * ri.quantity
           FROM expand e
             JOIN recipe_ingredients ri ON ri.recipe_id = e.sub_recipe_id
          WHERE e.sub_recipe_id IS NOT NULL
        ), mat AS (
         SELECT e.product_id,
            e.material_id,
            sum(e.qty) AS qty
           FROM expand e
          WHERE e.material_id IS NOT NULL
          GROUP BY e.product_id, e.material_id
        ), named AS (
         SELECT m.product_id,
            mc.name = 'Ароматизаторы'::text AS is_flavor,
            COALESCE(NULLIF(rm.tea_type, ''::text), pchk_clean_material_name(rm.name)) AS disp,
            m.qty
           FROM mat m
             JOIN raw_materials rm ON rm.id = m.material_id
             LEFT JOIN material_categories mc ON mc.id = rm.category_id
        ), grouped AS (
         SELECT named.product_id,
            named.disp,
            sum(named.qty) AS qty
           FROM named
          WHERE NOT named.is_flavor AND COALESCE(named.disp, ''::text) <> ''::text
          GROUP BY named.product_id, named.disp
        ), listed AS (
         SELECT grouped.product_id,
            string_agg(lower(grouped.disp), ', '::text ORDER BY grouped.qty DESC, grouped.disp) AS body
           FROM grouped
          GROUP BY grouped.product_id
        ), flav AS (
         SELECT named.product_id,
            count(*) AS n
           FROM named
          WHERE named.is_flavor
          GROUP BY named.product_id
        )
 SELECT p.id AS product_id,
    p.article AS sku_article,
    initcap("left"(t.txt, 1)) || "right"(t.txt, '-1'::integer) AS composition
   FROM products p
     JOIN listed l ON l.product_id = p.id
     LEFT JOIN flav f ON f.product_id = p.id
     CROSS JOIN LATERAL ( SELECT l.body ||
                CASE
                    WHEN COALESCE(f.n, 0::bigint) > 0 THEN ', ароматизатор'::text
                    ELSE ''::text
                END AS txt) t;

CREATE VIEW pricelist_export_v1 AS
 SELECT p.id AS product_id,
    sc.sku_article,
    p.name AS product_name,
    COALESCE(
        CASE
            WHEN p.package_unit = 'кг'::text THEN round(p.package_size * 1000::numeric)::integer
            WHEN p.package_unit = 'г'::text THEN round(p.package_size)::integer
            ELSE NULL::integer
        END, (regexp_match(p.name, '([0-9]+)[[:space:]]*г\.?[[:space:]]*$'::text))[1]::integer, (regexp_match(p.name, '([0-9]+)[[:space:]]*г[[:space:]]'::text))[1]::integer) AS package_grams,
    p.package_unit,
    s.code AS section_code,
    s.name AS section_name,
    s.sort_order AS section_sort,
    ss.code AS subsection_code,
    ss.name AS subsection_name,
    ss.sort_order AS subsection_sort,
    pp.group_name,
    pp.sort_order AS item_sort,
    cmp.composition,
    pd.description,
    round(sc.total_sku_cost * 2.70)::integer AS price_basic,
    round(sc.total_sku_cost * 2.50)::integer AS price_opt,
    round(sc.total_sku_cost * 2.30)::integer AS price_opt_plus,
    round(sc.total_sku_cost * 2.10)::integer AS price_partner,
    round(sc.total_sku_cost * 1.95)::integer AS price_key_partner
   FROM product_pricelist_position pp
     JOIN products p ON p.id = pp.product_id AND p.is_active
     JOIN sku_cost sc ON sc.product_id = p.id
     JOIN pricelist_subsections ss ON ss.id = pp.subsection_id
     JOIN pricelist_sections s ON s.id = ss.section_id
     LEFT JOIN sku_composition_v1 cmp ON cmp.product_id = p.id
     LEFT JOIN product_descriptions pd ON pd.product_id = p.id;

CREATE VIEW ozon_sku_costs_v AS
 WITH cur_price AS (
         SELECT DISTINCT ON (material_prices.material_id) material_prices.material_id,
            material_prices.price_per_unit
           FROM material_prices
          ORDER BY material_prices.material_id, material_prices.valid_from DESC
        ), base_cost AS (
         SELECT ri.recipe_id,
            sum(ri.quantity * cp_1.price_per_unit) AS mat_cost,
            sum(ri.quantity) AS mat_qty
           FROM recipe_ingredients ri
             JOIN cur_price cp_1 ON cp_1.material_id = ri.material_id
          WHERE ri.material_id IS NOT NULL
          GROUP BY ri.recipe_id
        ), full_cost AS (
         SELECT r.id AS recipe_id,
            (COALESCE(b.mat_cost, 0::numeric) + COALESCE(sub.sub_cost, 0::numeric)) / NULLIF(COALESCE(b.mat_qty, 0::numeric) + COALESCE(sub.sub_qty, 0::numeric), 0::numeric) AS cost_per_kg
           FROM recipes r
             LEFT JOIN base_cost b ON b.recipe_id = r.id
             LEFT JOIN LATERAL ( SELECT sum(ri.quantity * bs.mat_cost / NULLIF(bs.mat_qty, 0::numeric)) AS sub_cost,
                    sum(ri.quantity) AS sub_qty
                   FROM recipe_ingredients ri
                     JOIN base_cost bs ON bs.recipe_id = ri.sub_recipe_id
                  WHERE ri.recipe_id = r.id AND ri.sub_recipe_id IS NOT NULL) sub ON true
        )
 SELECT p.article,
    p.name,
    round(sum(
        CASE
            WHEN c.material_id IS NOT NULL THEN c.quantity * cp.price_per_unit
            WHEN c.recipe_id IS NOT NULL THEN c.quantity * fc.cost_per_kg
            ELSE 0::numeric
        END), 2) AS cost
   FROM products p
     JOIN sku_recipe_components c ON c.product_id = p.id
     LEFT JOIN cur_price cp ON cp.material_id = c.material_id
     LEFT JOIN full_cost fc ON fc.recipe_id = c.recipe_id
  WHERE p.article IS NOT NULL
  GROUP BY p.article, p.name;

COMMIT;

-- Read-only доступ витрины к новым объектам
GRANT SELECT ON ALL TABLES IN SCHEMA public TO django;
