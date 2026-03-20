# Tea Production API

Все роуты доступны через Vercel. Используй `web_fetch` в Claude для запросов.

## Base URL
```
https://tea-production-db.vercel.app
```

## Роуты

### 🔍 Проверка соединения
```
GET /api/health
```
Возвращает статус БД и количество позиций сырья. **Вызывай в начале каждой сессии.**

---

### 🌿 Сырьё и материалы

**Поиск по артикулу или названию:**
```
GET /api/materials/search?q=5214
GET /api/materials/search?q=бергамот
```

**Получить по точному артикулу** (/ кодируется как %2F):
```
GET /api/materials/5214%2F1
```

---

### 📋 Рецепты

**Список всех рецептов:**
```
GET /api/recipes
GET /api/recipes?active=1
```

**Рецепт + состав + себестоимость:**
```
GET /api/recipes/2105
GET /api/recipes/123
```

---

### 📦 SKU

**Список всех SKU:**
```
GET /api/sku
GET /api/sku?type_id=38
```

**SKU + состав + себестоимость:**
```
GET /api/sku/2105-10
```

---

### 💰 Себестоимость

```
GET /api/costs              — всё
GET /api/costs?type=recipe  — только рецепты
GET /api/costs?type=sku     — только SKU
```

---

## Настройка Vercel (обязательно)

Добавь в Vercel → Settings → Environment Variables:
```
SUPABASE_URL=https://heznxwdrwyjipyracyqy.supabase.co
SUPABASE_SERVICE_KEY=<твой service_role key из Supabase Settings → API>
```

> ⚠️ Используй `service_role` key (не `anon`) — он не протухает и даёт полный доступ.

---

## Как Claude использует API

Вместо Supabase MCP, который ломается при каждой сессии, Claude делает обычный HTTP-запрос:

```
web_fetch: https://tea-production-db.vercel.app/api/materials/search?q=5214
```

Это работает всегда — без OAuth, без переподключений, без токенов.
