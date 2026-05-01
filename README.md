# Tea Production DB

Веб-приложение и Edge Functions для работы с базой данных производства чая.

## Стек
- **БД:** Supabase (PostgreSQL)
- **Frontend:** React + Vite + Tailwind, авто-деплой на Vercel
- **Edge Functions:** Supabase Functions + Anthropic API

## Структура
```
app/                    — фронтенд (React + Vite)
api/                    — серверные роуты
supabase/functions/     — Edge Functions
supabase/migrations/    — миграции схемы БД
```

## Развёртывание
- Frontend: автодеплой Vercel из `main`
- Edge Functions: `supabase functions deploy <name>`
- Миграции: `supabase db push`

## Документация и данные
Контекст для AI-сессий, рабочие инструкции и архив выгрузок — в приватном репозитории `andmanuylov-ftc/tea-production-data`.
