# Контекст проекта — Tea Production DB
> Этот файл читается Claude в начале каждой сессии. Обновляй после каждого сеанса работы.

---

## Подключения

| Сервис | Значение |
|---|---|
| Supabase URL | `https://heznxwdrwyjipyracyqy.supabase.co` |
| GitHub | `andmanuylov-ftc/tea-production-db` |
| Vercel | авто-деплой при push в main |

---

## Схема БД — все таблицы

### Основные
- **raw_materials** — сырьё и материалы (482 позиции). Поля: `id, article, name, unit, category_id`
- **material_categories** — категории сырья
- **material_prices** — цены на сырьё с историей. Поля: `id, material_id, price_per_unit, valid_from, valid_to, supplier, notes`
- **recipes** — рецепты чаёв. Поля: `id, article, name, description, output_quantity, output_unit, notes, is_active`
- **recipe_ingredients** — состав рецепта. Поля: `id, recipe_id, material_id, sub_recipe_id, quantity, unit`
- **products** — SKU (готовые продукты). Поля: `id, article, name, type_id, package_size, package_unit, recipe_id, photo_url`
- **product_types** — типы упаковки (иерархия)
- **sku_recipe_components** — состав SKU (рецепт + упаковочные материалы). Поля: `id, product_id, recipe_id, material_id, quantity, unit`
- **price_lists** — прайслисты. Поля: `id, name, markup_percent, is_active`
- **price_list_items** — позиции прайслиста. Поля: `id, price_list_id, product_id, price, override_markup_percent`

### Ассортименты
- **assortments** — справочник ассортиментов. Поля: `id, code, name, description, created_at`
  - Записи: `OLD_TEA` (Старый ассортимент), `NEW_TEA` (Новый ассортимент)
- **assortment_products** — SKU в ассортименте (many-to-many). Поля: `id, assortment_id, product_id, added_at, notes`
- **assortment_recipes** — рецепты в ассортименте (many-to-many). Поля: `id, assortment_id, recipe_id, added_at, notes`
- **assortment_price_lists** — прайслисты в ассортименте (many-to-many). Поля: `id, assortment_id, price_list_id, added_at`
- **assortment_materials** — сырьё в ассортименте (many-to-many). Поля: `id, assortment_id, material_id, added_at, notes`

### Конструктор / Проект
- **projects** — сохранённые конструкции. Поля: `id, type ('recipe'|'sku'), name, notes, created_at`
- **project_items** — состав конструкции. Поля: `id, project_id, material_id (nullable), recipe_id (nullable), quantity, unit`
  - Ограничение: ровно одно из `material_id` или `recipe_id` должно быть заполнено

### Views
- **recipe_cost** — себестоимость рецепта (руб/кг, рекурсивная). Поля: `recipe_id, recipe_article, recipe_name, output_quantity, output_unit, total_cost, cost_per_kg`
- **sku_cost** — себестоимость SKU. Поля: `product_id, sku_article, product_name, package_size, package_unit, blend_cost, packaging_cost, total_sku_cost`
- **product_pricing** — ценообразование. Поля: `product_id, sku_article, product_name, package_size, package_unit, total_sku_cost, price_list_id, price_list_name, markup_percent, final_price`
- **raw_materials_with_price** — сырьё с актуальной ценой (LATERAL JOIN). Поля: `id, article, name, unit, category_id, current_price, price_date`

---

## Фронтенд — страницы приложения (Vercel, React + Vite + Tailwind)

| Маршрут | Файл | Описание |
|---|---|---|
| `/assortments` | `Assortments.jsx` | Карточки OLD_TEA и NEW_TEA с счётчиками |
| `/assortments/:code` | `AssortmentDetail.jsx` | Вкладки: Рецепты / SKU. Добавление/удаление |
| `/dashboard` | `Dashboard.jsx` | Статистика |
| `/recipes` | `Recipes.jsx` | Список рецептов + состав |
| `/skus` | `SKUs.jsx` | Список SKU + состав + фото |
| `/materials` | `Materials.jsx` | Сырьё и материалы: поиск, цена, история цен (3 даты), изменение через ⋯ меню |
| `/constructor` | `Constructor.jsx` | Конструктор рецептов и SKU. В режиме SKU — панель с вкладками Рецепты/Сырьё |
| `/project` | `Project.jsx` | Архив проектов (Рецепты/SKU). Просмотр состава, удаление с подтверждением |
| `/pricelists` | `PriceLists.jsx` | Прайс-листы с выгрузкой в XLS, выбором позиций, поиском |

### Навигация (Layout.jsx)
Порядок меню: Ассортименты · Дашборд · Рецепты · SKU · Сырьё · Конструктор · Проект · Прайс лист

### Брендинг
- Логотип в шапке сайдбара: **ПЧК/ADDIS**

### Примечания по фронту
- В `AssortmentDetail` вкладки: Рецепты (первая) → SKU
- В `Constructor` при типе SKU правая панель имеет вкладки: Рецепты (зелёная) → Сырьё (золотая)
- В `Materials` меню действий — выпадающее через кнопку ⋯ (MoreHorizontal)
- `PriceLists.jsx` — поддержка чекбоксов на строках, "Выделить все" (indeterminate), выгрузка выбранных или всех позиций в `.xlsx`. НДС 22% считается на фронте
- **Баг исправлен:** 17 SKU не отображались в прайсе из-за отсутствия записей в `sku_recipe_components` — исправлено 27.04.2026

---

## Правила ведения данных

- Единицы: только **кг** и **шт** (граммы запрещены в основных таблицах)
- В Конструкторе допустимы: г / кг / шт / мл
- Артикулы вносятся **строго как указано** (могут содержать `/`)
- Рецепт может содержать другой рецепт как компонент (`sub_recipe_id`)
- Цены в рублях, с историей (`valid_from`)
- `output_quantity = 1.000`, `output_unit = 'кг'` для всех рецептов

### ⛔ ОБЯЗАТЕЛЬНОЕ ПРАВИЛО — новое сырьё
> **Никогда не добавлять новый материал в `raw_materials` без одновременного внесения цены в `material_prices`.**
> Если цена неизвестна — остановиться и запросить её у пользователя перед созданием записи.
> Рецепт с новым сырьём создаётся только после того, как цена на это сырьё внесена в базу.

### ⛔ ОБЯЗАТЕЛЬНОЕ ПРАВИЛО — sku_recipe_components
> **При создании каждого нового SKU обязательно добавлять запись в `sku_recipe_components`.**
> Без этой записи SKU не отображается в прайсе и view `sku_cost` возвращает null.

### Правила категорий (type_id) для SKU

| type_id | Категория |
|---|---|
| 28 | Черные чаи |
| 29 | Зеленые чаи |
| 31 | Пуэры |
| 32 | Красные чаи |
| 33 | Травяные моносорта |
| 37 | Черный чай с добавками |
| 38 | Черный чай с ароматами |
| 39 | Моносорта (зелёный) |
| 41 | Зеленый чай с ароматами |
| 42 | Улуны моносорта |
| 44 | Улуны с ароматами |
| 46 | Травяные напитки с ароматом |
| 48 | Фруктово-ягодные напитки с ароматами |

**Ароматизаторы** — артикулы 2500–2599, 100–199

### Форматы артикулов SKU
- **-ПА500** — пакет 500 гр
- **-ЗИП100** — зип-пакет (Дой Пак) 100 гр
- **-ПР250** / **-ПР100** — прессованный/порционный (250 г, 100 г и т.д.)
- **-10** / **-10Б** — ПЭТ-банка

---

## Прайслист и ценообразование

```
Цена = total_sku_cost × (1 + markup_percent / 100)
```

### Текущие прайслисты
| Название | Наценка | Позиций |
|---|---|---|
| Прайс-лист | 150% | 43 |
| Прайс-лист | 100% | 0 (пустой, заполнить) |

### НДС — уточнить актуальность ставки 22%

### Курсы валют (последние использованные)
- USD: 75.5273 руб (ЦБ на 25.04.2026)
- EUR: 88.28 руб (ЦБ на 25.04.2026)

### Важные sub_recipe
- Рецепт **4101 «Цейлон OP1 (1 сорт)»** — чайная основа-блэнд (Кенийский FOP 1320 70% + Вьетнамский ОР 30%). Часто используется как sub_recipe в других рецептах — всегда подставлять через `sub_recipe_id`, не через `material_id`.

---

## Текущий статус (обновлено: 27.04.2026 сессия #2)

### Сырьё
- **482 позиции**, цены на 07.03.2026 (новые позиции датированы 27.04.2026)
- Новые материалы этих сессий (27.04.2026):
  - **2572** «Черимойя (14355)» — 3 001,52 руб (34 EUR)
  - **2614** «Яблоко кольца» — 300,00 руб
  - **105** «Маракуйя (18304)» — 3 089,80 руб (35 EUR)
  - **107** «Лесные ягоды (14669)» — 4 502,28 руб (51 EUR)
  - **113** «Гранат (15958)» — 3 089,80 руб (35 EUR)
  - **2574** «Клюква (04773)» — 2 030,44 руб (23 EUR)

### Рецепты — 227 шт.
> Полный список всегда актуален в базе (таблица `recipes`, view `recipe_cost`).
> Для получения списка с себестоимостью: `SELECT recipe_article, recipe_name, cost_per_kg FROM recipe_cost ORDER BY recipe_article`

### SKU — 251 шт.
> Полный список в базе (таблица `products`, view `sku_cost`).
> Все SKU имеют записи в `sku_recipe_components` (проверено 27.04.2026).

### Прайс-листы — 2 шт.
- **+150%** — 43 позиции (наполнен)
- **+100%** — 0 позиций (пустой, требует наполнения)

### Ассортименты
- **OLD_TEA** и **NEW_TEA** созданы, пока пустые — заполнить вручную

---

## Следующие задачи

- [ ] Наполнить прайс-лист +100% позициями
- [ ] Заполнить OLD_TEA и NEW_TEA (SKU + рецепты)
- [ ] Продолжить ввод рецептов (пользователь предоставляет данные)
- [ ] Рецепт 9904 «Цветущий сад» — уже в базе, проверить полноту состава

---

## Стандартная фраза для начала сессии

```
Продолжаем проект чайного производства.
Supabase: https://heznxwdrwyjipyracyqy.supabase.co
GitHub: andmanuylov-ftc/tea-production-db
Прочитай docs/CONTEXT.md из репозитория и войди в контекст.
```

---

## Инструкция для Claude

1. Прочитать этот файл — `docs/CONTEXT.md`
2. Ответить кратко: сколько рецептов, SKU, что следующее
3. Спросить: "Что делаем?"
4. После сессии — обновить этот файл
5. При заведении нового SKU — выбирать type_id по таблице категорий
6. **Перед добавлением нового сырья — всегда запрашивать цену. Без цены не создавать.**
7. При конвертации валюты — использовать курс ЦБ РФ актуальный на дату, фиксировать в notes к цене.
8. **После создания SKU — всегда проверять наличие записи в `sku_recipe_components`.**
