# Tea Production API — Stable Endpoints

Базовый URL: `https://<your-vercel-domain>.vercel.app`

Все эндпоинты работают **без MCP, без OAuth**, только через `web_fetch` или браузер.

---

## Проверка состояния

```
GET /api/status
```
Показывает: подключение к БД, количество записей в ключевых таблицах, наличие env vars.

---

## Сырьё и материалы

```
GET /api/materials/search?q=5214
GET /api/materials/search?q=ройбуш
GET /api/materials/by-article?article=5214/1
```

---

## Рецепты

```
GET /api/recipes
GET /api/recipes?article=2306
GET /api/recipes/ingredients?recipe_id=42
```

---

## SKU

```
GET /api/sku
GET /api/sku?article=2306-ПА500
```

---

## Себестоимость

```
GET /api/costs?type=recipes
GET /api/costs?type=sku
```

---

## Произвольный SQL (защищён ключом)

```
POST /api/db/query
Headers: x-api-key: <API_SECRET>
Body: { "sql": "SELECT * FROM raw_materials WHERE article = '5214/1'" }
```

Только SELECT-запросы. `API_SECRET` — переменная окружения в Vercel.

---

## Необходимые Vercel Environment Variables

| Переменная | Откуда взять |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key |
| `API_SECRET` | Придумать самостоятельно, любая строка |

⚠️ `service_role` ключ — секретный. Никогда не публикуй его в коде.
