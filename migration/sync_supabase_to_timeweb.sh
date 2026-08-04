#!/usr/bin/env bash
# =====================================================================
#  Синхронизация данных Supabase (мастер) → timeweb (реплика)
#  Полная перезаливка данных схемы public. БД маленькая (~11k строк),
#  поэтому полный снимок каждый прогон — быстро, идемпотентно, надёжно.
#
#  Направление: ТОЛЬКО из Supabase в timeweb. timeweb на этапе 1 — копия
#  только для чтения. Изменения продолжают вноситься в Supabase.
#
#  Требования: установлен клиент postgresql-client 17 (pg_dump, psql).
#  Схема на timeweb уже создана (01_schema_public.sql применён).
#
#  Использование:
#    export SRC_DSN='postgresql://postgres:ПАРОЛЬ@db.heznxwdrwyjipyracyqy.supabase.co:5432/postgres?sslmode=require'
#    export DST_DSN='postgresql://tea:ПАРОЛЬ@ХОСТ_TIMEWEB:5432/tea_production?sslmode=disable'
#    ./sync_supabase_to_timeweb.sh
#
#  Пароль БД Supabase: Dashboard → Project Settings → Database → Connection string.
#  (Это пароль БД, НЕ anon/service ключ. Можно также использовать pooler-хост
#   aws-0-...pooler.supabase.com на порту 5432 в режиме session.)
# =====================================================================
set -euo pipefail

: "${SRC_DSN:?Не задан SRC_DSN (Supabase)}"
: "${DST_DSN:?Не задан DST_DSN (timeweb)}"

# Порядок не важен для data-only заливки — используем session_replication_role.
TABLES=(
  material_categories product_types clients assortments
  raw_materials material_prices recipes recipe_ingredients
  products sku_recipe_components product_descriptions
  price_lists price_list_items
  assortment_products assortment_recipes assortment_price_lists assortment_materials
  projects project_items
  managers pricelist_downloads
  pricelist_sections pricelist_subsections product_pricelist_position recipe_clients
)

DUMP="$(mktemp /tmp/tea_data_XXXX.sql)"
trap 'rm -f "$DUMP"' EXIT

echo "[$(date '+%F %T')] 1/3 Дамп данных из Supabase…"
TABLE_ARGS=()
for t in "${TABLES[@]}"; do TABLE_ARGS+=(--table="public.$t"); done
pg_dump "$SRC_DSN" \
  --data-only --no-owner --no-privileges --no-comments \
  "${TABLE_ARGS[@]}" \
  --file="$DUMP"
echo "     дамп: $(wc -l < "$DUMP") строк, $(du -h "$DUMP" | cut -f1)"

echo "[$(date '+%F %T')] 2/3 Загрузка в timeweb (truncate + insert)…"
CSV_LIST=$(IFS=, ; echo "${TABLES[*]}")
psql "$DST_DSN" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET session_replication_role = replica;   -- глушим триггеры и FK на время заливки
TRUNCATE ${CSV_LIST} RESTART IDENTITY CASCADE;
\i ${DUMP}
SET session_replication_role = origin;
COMMIT;
SQL

echo "[$(date '+%F %T')] 3/3 Сверка счётчиков…"
for t in "${TABLES[@]}"; do
  s=$(psql "$SRC_DSN" -tAc "SELECT count(*) FROM public.$t")
  d=$(psql "$DST_DSN" -tAc "SELECT count(*) FROM public.$t")
  flag="OK"; [ "$s" != "$d" ] && flag="!! РАСХОЖДЕНИЕ"
  printf "  %-26s src=%-6s dst=%-6s %s\n" "$t" "$s" "$d" "$flag"
done

echo "[$(date '+%F %T')] Готово."
