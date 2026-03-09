# Tea Production App

React + Vite + Tailwind + Supabase

## Запуск локально

```bash
cd app
npm install
cp .env.example .env.local
# заполните VITE_SUPABASE_ANON_KEY в .env.local
npm run dev
```

## Деплой на Vercel

1. Import репозитория на vercel.com
2. Root Directory: `app`
3. Добавить env vars:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Структура

```
src/
  lib/supabase.js       — клиент Supabase
  components/
    Layout.jsx          — sidebar + навигация
    StatCard.jsx        — карточка метрики
    PageHeader.jsx      — заголовок страницы
  pages/
    Dashboard.jsx       — сводка + топ рецептов
    Recipes.jsx         — список рецептов + состав
    SKUs.jsx            — SKU с фильтрами
    PriceLists.jsx      — прайслисты
```
