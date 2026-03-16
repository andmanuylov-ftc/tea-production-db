# Архитектура проекта и восстановление работы

Последнее обновление: 16.03.2026

---

## Общая архитектура

```
Claude (AI)
  ├── GitHub MCP         → репозиторий andmanuylov-ftc/tea-production-db
  └── Supabase MCP       → база данных heznxwdrwyjipyracyqy.supabase.co
```

---

## Supabase

- **Project URL:** `https://heznxwdrwyjipyracyqy.supabase.co`
- **Project ref:** `heznxwdrwyjipyracyqy`
- **Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlem54d2Ryd3lqaXB5cmFjeXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDQ1MTksImV4cCI6MjA4ODQyMDUxOX0.q4uyF_4YLWGUA32WJDuIWAY5XjRNjBY7cLBarUwd-fc`

---

## GitHub

- **Репозиторий:** `andmanuylov-ftc/tea-production-db`
- **Ветка:** `main`
- **Структура:**
  ```
  docs/         — документация (SCHEMA.md, PROGRESS.md, SETUP.md)
  migrations/   — SQL миграции схемы
  recipes/      — рецепты (SQL)
  sku/          — SKU / готовая продукция (SQL)
  ```

---

## Конфигурация Claude Desktop

Файл: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--project-ref",
        "heznxwdrwyjipyracyqy"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "<<PERSONAL_ACCESS_TOKEN>>"
      }
    },
    "github": {
      "command": "github-mcp-server",
      "args": ["stdio"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<<GITHUB_TOKEN>>"
      }
    }
  }
}
```

> Токены не хранятся в репозитории. Personal Access Token Supabase берётся на
> [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)

---

## Проверка работы MCP

### Supabase
```sql
SELECT article, name FROM raw_materials LIMIT 3;
```
Если возвращает данные — MCP работает.

### GitHub
Читаем `docs/PROGRESS.md` — если получаем содержимое файла, MCP работает.

---

## Восстановление при сбое

### Supabase MCP не работает

1. Открыть терминал
2. Проверить конфиг:
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```
3. Убедиться, что `SUPABASE_ACCESS_TOKEN` не отозван:
   [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
4. Перезапустить Claude Desktop: **Cmd+Q** → открыть снова
5. Попросить Claude: _"проверь Supabase"_

### Supabase MCP — "no tools available"

Значит сервер запущен, но пакет не установился. Выполнить в терминале:
```bash
npx -y @supabase/mcp-server-supabase@latest --project-ref heznxwdrwyjipyracyqy
```
Перезапустить Claude Desktop.

### Нужно переподключить Supabase в claude.ai

1. Перейти: [claude.ai/customize/connectors](https://claude.ai/customize/connectors)
2. Нажать **"+"** → **"Add custom connector"**
3. Name: `Supabase`, URL: `https://mcp.supabase.com/sse`
4. Нажать **Add** → кликнуть на Supabase → **Connect**
5. В открывшемся окне Supabase нажать **Authorize**

---

## Инструкция для Claude при старте новой сессии

При начале работы Claude должен:
1. Прочитать `docs/PROGRESS.md` — текущий прогресс
2. Прочитать `docs/SCHEMA.md` — схема БД
3. Прочитать `docs/SETUP.md` — архитектура (этот файл)
4. Выполнить тестовый запрос к Supabase для проверки соединения
