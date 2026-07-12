// ============================================================================
// Клиентский прайс-лист ПЧК (бланк заказов) — сборка книги XLSX с нуля.
//
// Источник данных — view `pricelist_export_v1` (см. CONTEXT.md):
//   sku_article, product_name, package_grams, section_code/name/sort,
//   subsection_code/name/sort, group_name, item_sort, composition, description,
//   price_basic, price_opt, price_opt_plus, price_partner, price_key_partner
//   (цены — целые, БЕЗ НДС; НДС накручивается здесь при withVat = true).
//
// Лист «Прайс-лист» строится динамически: число строк зависит от выборки,
// поэтому статический шаблон не используется — всё, включая формулы
// «Бланка заказа», пересчитывается под фактическое количество позиций.
// ============================================================================

import ExcelJS from 'exceljs'

// ---------- Константы оформления (сняты с эталона 2026-07-07) ----------------

const C = {
  dark:   'FF1F4E3D', // тёмно-зелёный — шапки листов
  green:  'FF00B050', // зелёный — строки заголовков таблицы и группы
  sand:   'FFEFE4C8', // песочный — подписи полей
  cream:  'FFFFF2CC', // кремовый — ячейки ввода
  paper:  'FFF7F1E3',
  grey:   'FFF2F2F2',
  pgHead: 'FF184C3A',
  pgSub:  'FF2F6B4F',
  pgGold: 'FFD9A441',
  pgSoft: 'FFF6F1E7',
}

const VAT_RATE = 0.22

const TIER_LABELS     = ['Базовый', 'Опт', 'Опт+', 'Партнер', 'Ключевой партнер']
const TIER_THRESHOLDS = [18000, 60000, 180000, 360000, 600000]
const TIER_CAPTIONS   = ['От 18.000 руб.', 'От 60.000 руб.', 'От 180.000 руб.', 'От 360.000 руб.', 'От 600.000 руб.']
const TIER_KEYS       = ['price_basic', 'price_opt', 'price_opt_plus', 'price_partner', 'price_key_partner']

const dashed = { style: 'dashed' }
const BORDER_DASHED = { top: dashed, left: dashed, bottom: dashed, right: dashed }
const thin = { style: 'thin' }
const BORDER_THIN = { top: thin, left: thin, bottom: thin, right: thin }

const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

// Формат цены: с НДС — две копейки, без НДС — целые рубли
const moneyFmt = withVat => (withVat ? '#,##0.00" ₽"' : '#,##0" ₽"')

// ---------- Хелперы ---------------------------------------------------------

function baseArticle(article) {
  // «4200-ПА500» → «4200»; «7068-СМ-500» → «7068»; «7049И» → «7049И»
  const s = String(article ?? '')
  const i = s.indexOf('-')
  return i === -1 ? s : s.slice(0, i)
}

function priceOf(row, key, withVat) {
  const v = Number(row[key] ?? 0)
  if (!withVat) return v
  return Math.round(v * (1 + VAT_RATE) * 100) / 100
}

/**
 * Раскладывает плоский список позиций (уже отсортированный по item_sort)
 * в блоки: раздел → подраздел → группы → позиции.
 */
function buildBlocks(rows) {
  const blocks = []
  let block = null
  let group = null

  for (const r of rows) {
    const blockKey = `${r.section_code}|${r.subsection_code ?? ''}`
    if (!block || block.key !== blockKey) {
      block = {
        key: blockKey,
        sectionCode: r.section_code,
        sectionName: r.section_name,
        subCode: r.subsection_name ? r.subsection_code : null,
        subName: r.subsection_name || null,
        groups: [],
      }
      blocks.push(block)
      group = null
    }
    const groupName = r.group_name || ''
    if (!group || group.name !== groupName) {
      group = { name: groupName, rows: [] }
      block.groups.push(group)
    }
    group.rows.push(r)
  }
  return blocks
}

// ---------- Лист «Прайс-лист» ------------------------------------------------

function buildPriceSheet(wb, blocks, opts) {
  const { withVat, dateStr } = opts
  const ws = wb.addWorksheet('Прайс-лист', {
    views: [{ showGridLines: false, zoomScale: 75 }],
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      scale: 55,
      margins: { left: 0.39, right: 0.39, top: 0.39, bottom: 0.39, header: 0.39, footer: 0.39 },
    },
  })

  ws.columns = [
    { key: 'a', width: 4.3 },   // A — номер раздела
    { key: 'b', width: 29.1 },  // B — наименование
    { key: 'c', width: 13.8 },  // C — артикул
    { key: 'd', width: 9.3 },   // D — фасовка
    { key: 'e', width: 30.3 },  // E — состав
    { key: 'f', width: 45.2 },  // F — краткое описание
    { key: 'g', width: 13.1 },  // G..K — 5 уровней цен
    { key: 'h', width: 13.1 },
    { key: 'i', width: 13.1 },
    { key: 'j', width: 13.1 },
    { key: 'k', width: 13.1 },
    { key: 'l', width: 12.4 },  // L — кол-во в заказ (ввод клиента)
    { key: 'm', width: 14 },    // M — цена для расчёта
    { key: 'n', width: 14 },    // N — сумма
    { key: 'o', width: 8 },     // O — № в заказе
    { key: 'p', width: 30, hidden: true }, // P — категория (для «Бланка заказа»)
    { key: 'q', width: 8,  hidden: true }, // Q — ед. изм.
  ]

  const vatWord = withVat ? 'с НДС' : 'без НДС'

  // --- Шапка -----------------------------------------------------------------
  const title = ws.getCell('B1')
  title.value = `ПЧК — B2B прайс-лист и выбор позиций для заказа (${vatWord})`
  title.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  title.fill = fill(C.dark)

  const sub = ws.getCell('B2')
  sub.value = 'Поставьте количество в колонке «Кол-во в заказ». Выбранные позиции автоматически попадут на лист «Бланк заказа».'
  sub.fill = fill(C.paper)

  const info = [
    ['Уровень цен для расчета (авто)', { formula: `IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[1]},"${TIER_LABELS[0]}",IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[2]},"${TIER_LABELS[1]}",IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[3]},"${TIER_LABELS[2]}",IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[4]},"${TIER_LABELS[3]}","${TIER_LABELS[4]}"))))` }],
    ['Статус минимального заказа',     { formula: `IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[0]},"⚠ Сумма ниже минимума 18 000 ₽ — доберите заказ","✓ Минимум достигнут")` }],
    ['До следующего уровня осталось',  { formula: `IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[0]},${TIER_THRESHOLDS[0]}-'Служебный лист'!$B$15,IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[1]},${TIER_THRESHOLDS[1]}-'Служебный лист'!$B$15,IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[2]},${TIER_THRESHOLDS[2]}-'Служебный лист'!$B$15,IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[3]},${TIER_THRESHOLDS[3]}-'Служебный лист'!$B$15,IF('Служебный лист'!$B$15<${TIER_THRESHOLDS[4]},${TIER_THRESHOLDS[4]}-'Служебный лист'!$B$15,"максимальный уровень")))))` }],
    ['Дата выгрузки',                  dateStr],
    ['Важно',                          'Итоговые цены, наличие, бонусы и специальные условия подтверждаются менеджером. Прайс-лист не является публичной офертой.'],
  ]
  info.forEach(([label, value], i) => {
    const r = 4 + i
    const lc = ws.getCell(`B${r}`)
    lc.value = label
    lc.font = { bold: true }
    lc.fill = fill(C.sand)
    const vc = ws.getCell(`C${r}`)
    vc.value = value
    vc.fill = fill(i === info.length - 1 ? C.grey : C.cream)
    if (i === info.length - 1) vc.font = { italic: true }
  })

  // --- Тело: блоки -----------------------------------------------------------
  let row = 10
  let firstDataRow = null
  let lastDataRow = null
  let firstHeaderRow = null
  const merges = []   // [{ from, to }] — диапазоны для E/F

  for (const block of blocks) {
    const hasSub = Boolean(block.subName)

    // строка раздела
    const secRow = ws.getRow(row)
    secRow.getCell(1).value = `${block.sectionCode}.`
    secRow.getCell(2).value = block.sectionName
    ;[1, 2].forEach(c => { secRow.getCell(c).font = { size: 14, bold: true } })
    secRow.height = 18.3

    // строка подраздела (если есть) + подписи порогов
    const capRow = hasSub ? ws.getRow(++row) : secRow
    if (hasSub) {
      capRow.getCell(1).value = `${block.subCode}.`
      capRow.getCell(2).value = block.subName
      ;[1, 2].forEach(c => { capRow.getCell(c).font = { size: 14, bold: true } })
      capRow.height = 18.3
    }
    TIER_CAPTIONS.forEach((cap, i) => {
      const cell = capRow.getCell(7 + i)
      cell.value = cap
      cell.font = { size: 10 }
      cell.alignment = { horizontal: 'center' }
    })
    row++

    // шапка таблицы
    const headRow = ws.getRow(row)
    if (firstHeaderRow === null) firstHeaderRow = row
    const heads = [
      'Наименование', 'Артикул', 'Фасовка, гр.', 'Состав', 'Краткое описание',
      ...TIER_LABELS,
      'Кол-во в заказ', `Цена для расчета ${vatWord}`, `Сумма ${vatWord}`, '№ в заказе',
    ]
    heads.forEach((h, i) => {
      const cell = headRow.getCell(2 + i)
      cell.value = h
      cell.font = { bold: true }
      cell.fill = fill(C.green)
      cell.border = BORDER_DASHED
      cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true }
    })
    headRow.height = 28.8
    row++

    for (const group of block.groups) {
      if (group.name) {
        const gRow = ws.getRow(row)
        for (let c = 2; c <= 15; c++) {
          const cell = gRow.getCell(c)
          cell.fill = fill(C.green)
          cell.border = BORDER_DASHED
          cell.font = { bold: true }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        }
        const gc = gRow.getCell(2)
        gc.value = group.name
        gc.font = { size: 14, bold: true }
        gc.alignment = { horizontal: 'left', vertical: 'middle' }
        gRow.height = 18.3
        row++
      }

      // позиции; мерджим Состав/Описание по вариантам одного купажа
      let runStart = null
      let runBase = null

      group.rows.forEach((r, idx) => {
        const rIdx = row
        if (firstDataRow === null) firstDataRow = rIdx
        lastDataRow = rIdx

        const base = baseArticle(r.sku_article)
        if (runBase !== base) {
          if (runStart !== null && rIdx - runStart > 1) merges.push({ from: runStart, to: rIdx - 1 })
          runStart = rIdx
          runBase = base
        }
        const isRunFirst = runStart === rIdx

        const xr = ws.getRow(rIdx)
        xr.getCell(2).value = r.product_name ?? ''
        xr.getCell(3).value = r.sku_article ?? ''
        xr.getCell(4).value = r.package_grams ?? null
        if (isRunFirst) {
          xr.getCell(5).value = r.composition ?? ''
          xr.getCell(6).value = r.description ?? ''
        }
        TIER_KEYS.forEach((key, i) => { xr.getCell(7 + i).value = priceOf(r, key, withVat) })

        xr.getCell(13).value = { formula: `IF($L${rIdx}>0,CHOOSE(MATCH($C$4,'Служебный лист'!$A$4:$A$8,0),G${rIdx},H${rIdx},I${rIdx},J${rIdx},K${rIdx}),"")` }
        xr.getCell(14).value = { formula: `IFERROR($L${rIdx}*$M${rIdx},0)` }
        xr.getCell(15).value = { formula: `IF($L${rIdx}>0,COUNTIF($L$${firstDataRow}:L${rIdx},">0"),"")` }
        // служебные (скрытые) — для «Бланка заказа»
        xr.getCell(16).value = block.subName ? `${block.sectionName} · ${block.subName}` : block.sectionName
        xr.getCell(17).value = 'гр'

        for (let c = 2; c <= 15; c++) {
          const cell = xr.getCell(c)
          cell.border = BORDER_DASHED
          cell.alignment = { vertical: 'middle', wrapText: true, horizontal: c <= 6 ? 'left' : 'center' }
        }
        xr.getCell(4).numFmt = '#,##0" гр."'
        xr.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }
        for (let c = 7; c <= 11; c++) xr.getCell(c).numFmt = moneyFmt(withVat)
        const inp = xr.getCell(12)
        inp.fill = fill(C.cream)
        inp.numFmt = '0'
        inp.alignment = { horizontal: 'right', vertical: 'middle' }
        xr.getCell(13).numFmt = moneyFmt(withVat)
        xr.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' }
        xr.getCell(14).numFmt = moneyFmt(withVat)
        xr.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' }
        xr.getCell(15).numFmt = '0'
        xr.height = 23.15

        row++
        if (idx === group.rows.length - 1 && runStart !== null && row - runStart > 1) {
          merges.push({ from: runStart, to: row - 1 })
          runStart = null
          runBase = null
        }
      })
      runStart = null
      runBase = null
    }

    row += 2 // отбивка между блоками
  }

  merges.forEach(({ from, to }) => {
    ws.mergeCells(`E${from}:E${to}`)
    ws.mergeCells(`F${from}:F${to}`)
    ws.getCell(`E${from}`).alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' }
    ws.getCell(`F${from}`).alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' }
  })

  if (firstHeaderRow !== null && lastDataRow !== null) {
    ws.autoFilter = { from: `B${firstHeaderRow}`, to: `O${lastDataRow}` }
  }

  return { firstDataRow, lastDataRow }
}

// ---------- Лист «Бланк заказа» ---------------------------------------------

function buildOrderSheet(wb, count, range, opts) {
  const { withVat, dateStr, managerName } = opts
  const { firstDataRow: F, lastDataRow: L } = range
  const vatWord = withVat ? 'с НДС' : 'без НДС'

  const ws = wb.addWorksheet('Бланк заказа', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [
    { width: 23.2 }, { width: 16 }, { width: 18 }, { width: 58.3 }, { width: 13.1 },
    { width: 32.4 }, { width: 27.5 }, { width: 10 }, { width: 20.4 }, { width: 22 },
  ]

  ws.mergeCells('A1:J1')
  const t = ws.getCell('A1')
  t.value = 'Бланк заказа — автоматически собирается из листа «Прайс-лист»'
  t.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  t.fill = fill(C.dark)
  t.alignment = { horizontal: 'center' }

  ws.mergeCells('A2:J2')
  const t2 = ws.getCell('A2')
  t2.value = 'Заполните количество на листе «Прайс-лист». В этот бланк автоматически попадают только выбранные позиции.'
  t2.fill = fill(C.paper)
  t2.alignment = { horizontal: 'center' }

  const first = 16
  const last = first + Math.max(count, 1) - 1
  const P = "'Прайс-лист'!"
  const idx = (col, r) => `IFERROR(INDEX(${P}$${col}$${F}:$${col}$${L},MATCH(ROWS($A$16:A${r}),${P}$O$${F}:$O$${L},0)),"")`

  // Шапка клиента
  const labels = [
    ['A4', 'Дата заказа'], ['A5', 'Название клиента'], ['A6', 'Контактное лицо'],
    ['A7', 'Менеджер'], ['A8', 'Комментарий к заказу'],
    ['C5', 'Город'], ['C6', 'Телефон / email'], ['C7', 'Условия оплаты'],
  ]
  labels.forEach(([addr, text]) => {
    const c = ws.getCell(addr)
    c.value = text
    c.font = { bold: true }
    c.fill = fill(C.sand)
    c.border = BORDER_DASHED
  })
  const inputs = ['B4', 'B5', 'B6', 'B7', 'B8', 'D5', 'D6', 'D7']
  inputs.forEach(addr => {
    const c = ws.getCell(addr)
    c.fill = fill(C.cream)
    c.border = BORDER_DASHED
    c.alignment = { horizontal: 'center' }
  })
  ws.getCell('B4').value = dateStr
  ws.getCell('B7').value = managerName ?? ''
  ws.getCell('D7').value = '100% предоплата / по договору'

  // Итоги
  const th = ws.getCell('F4')
  th.value = 'Итог заказа'
  th.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  th.fill = fill(C.dark)
  th.alignment = { horizontal: 'center' }
  th.border = BORDER_DASHED

  const S = "'Служебный лист'!$B$15"
  const totals = [
    [`Сумма ${vatWord}`,                  { formula: `SUM(I${first}:I${last})` },                       moneyFmt(withVat)],
    ['Количество выбранных SKU',          { formula: `COUNTIF(H${first}:H${last},">0")` },              '0'],
    ['Текущий уровень',                   { formula: `IF(${S}<${TIER_THRESHOLDS[0]},"Ниже минимума",IF(${S}<${TIER_THRESHOLDS[1]},"${TIER_LABELS[0]}",IF(${S}<${TIER_THRESHOLDS[2]},"${TIER_LABELS[1]}",IF(${S}<${TIER_THRESHOLDS[3]},"${TIER_LABELS[2]}",IF(${S}<${TIER_THRESHOLDS[4]},"${TIER_LABELS[3]}","${TIER_LABELS[4]}")))))` }, 'General'],
    ['Следующий порог',                   { formula: `IF(${S}<${TIER_THRESHOLDS[0]},${TIER_THRESHOLDS[0]},IF(${S}<${TIER_THRESHOLDS[1]},${TIER_THRESHOLDS[1]},IF(${S}<${TIER_THRESHOLDS[2]},${TIER_THRESHOLDS[2]},IF(${S}<${TIER_THRESHOLDS[3]},${TIER_THRESHOLDS[3]},IF(${S}<${TIER_THRESHOLDS[4]},${TIER_THRESHOLDS[4]},"")))))` }, moneyFmt(withVat)],
    ['До следующего уровня осталось',     { formula: `IF(G8="",0,MAX(G8-${S},0))` },                     moneyFmt(withVat)],
    ['Проверка минимального заказа',      { formula: `IF(${S}<${TIER_THRESHOLDS[0]},"Минимальная сумма заказа — 18 000 ₽ ${vatWord}","Заказ соответствует минимальной сумме")` }, 'General'],
    ['Возможные партнерские преимущества',{ formula: `IF(${S}<${TIER_THRESHOLDS[0]},"Доберите заказ до минимальной суммы",IF(${S}>=${TIER_THRESHOLDS[4]},"Возможны индивидуальные условия и ретробонус",IF(${S}>=${TIER_THRESHOLDS[3]},"Возможны партнерские условия и ретробонус",IF(${S}>=${TIER_THRESHOLDS[2]},"Возможны образцы новинок и расширенные условия",IF(G6>=20,"Возможен бонус за ширину ассортимента","Обсудите с менеджером условия регулярных закупок")))))` }, 'General'],
  ]
  totals.forEach(([label, value, fmt], i) => {
    const r = 5 + i
    const lc = ws.getCell(`F${r}`)
    lc.value = label
    lc.font = { bold: true }
    lc.fill = fill(C.sand)
    lc.border = BORDER_DASHED
    const vc = ws.getCell(`G${r}`)
    vc.value = value
    vc.numFmt = fmt
    vc.fill = fill(C.grey)
    vc.border = BORDER_DASHED
  })

  // Таблица позиций
  const heads = ['№', 'Категория', 'Артикул', 'Наименование', 'Фасовка', 'Ед. изм.',
                 `Цена ${vatWord}`, 'Кол-во', `Сумма ${vatWord}`, 'Комментарий']
  const hr = ws.getRow(15)
  heads.forEach((h, i) => {
    const c = hr.getCell(1 + i)
    c.value = h
    c.font = { bold: true }
    c.fill = fill(C.grey)
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  for (let r = first; r <= last; r++) {
    const xr = ws.getRow(r)
    xr.getCell(1).value = { formula: `IFERROR(IF(INDEX(${P}$O$${F}:$O$${L},MATCH(ROWS($A$16:A${r}),${P}$O$${F}:$O$${L},0))="","",ROWS($A$16:A${r})),"")` }
    xr.getCell(2).value = { formula: idx('P', r) } // категория (скрытая колонка прайса)
    xr.getCell(3).value = { formula: idx('C', r) } // артикул
    xr.getCell(4).value = { formula: idx('B', r) } // наименование
    xr.getCell(5).value = { formula: idx('D', r) } // фасовка
    xr.getCell(6).value = { formula: idx('Q', r) } // ед. изм.
    xr.getCell(7).value = { formula: idx('M', r) } // цена для расчёта
    xr.getCell(8).value = { formula: idx('L', r) } // кол-во
    xr.getCell(9).value = { formula: `IFERROR(IF($H${r}="","",$G${r}*$H${r}),"")` }
    xr.getCell(1).numFmt = '0'
    xr.getCell(7).numFmt = moneyFmt(withVat)
    xr.getCell(8).numFmt = '0'
    xr.getCell(9).numFmt = moneyFmt(withVat)
    for (let c = 1; c <= 10; c++) {
      xr.getCell(c).alignment = { vertical: 'middle', wrapText: true, horizontal: c >= 7 ? 'right' : 'left' }
    }
  }

  const noteRow = last + 2
  ws.mergeCells(`A${noteRow}:J${noteRow + 1}`)
  const note = ws.getCell(`A${noteRow}`)
  note.value = 'Цены, наличие товара, бонусы и специальные условия подтверждаются менеджером после проверки заказа. Прайс-лист не является публичной офертой.'
  note.fill = fill(C.grey)
  note.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
}

// ---------- Лист «Партнерская программа» ------------------------------------

const PARTNER_PROGRAM = [
  { type: 'title',   text: 'Партнерская программа регулярных закупок ПЧК' },
  { type: 'lead',    text: 'Больше регулярности — больше партнерских преимуществ' },
  { type: 'intro',   text: 'Мы обновили подход к работе с B2B-клиентами. Условия зависят от суммы заказа, регулярности закупок, роста объема, ширины ассортимента и платежной дисциплины.' },
  { type: 'section', text: '1. Ценовые уровни' },
  { type: 'head',    cells: ['Уровень', 'Сумма заказа без НДС', 'Что означает', 'Индивидуальные условия'] },
  { type: 'row', cells: ['Базовый', 'от 18 000 до 60 000 ₽', 'стартовый заказ, базовые условия', 'нет'] },
  { type: 'row', cells: ['Опт', 'от 60 000 ₽ до 180 000 ₽', 'стандартный оптовый уровень', 'нет'] },
  { type: 'row', cells: ['Опт+', 'от 180 000 ₽ до 360 000 ₽', 'улучшенный уровень для увеличенного заказа', 'только как исключение'] },
  { type: 'row', cells: ['Партнер', 'от 360 000 ₽ до 600 000 ₽', 'расширенные партнерские преимущества', 'частично возможны'] },
  { type: 'row', cells: ['Ключевой партнер', 'от 600 000 ₽', 'индивидуальные условия и возможность ретробонуса', 'да'] },
  { type: 'gap' },
  { type: 'section', text: '2. Как получить больше преимуществ' },
  { type: 'head', cells: ['Механика', 'Что нужно сделать', 'Что может получить клиент', 'Комментарий'] },
  { type: 'row', cells: ['Ценовые уровни', 'увеличить сумму заказа', 'перейти на более выгодный уровень', 'уровень считается от суммы без НДС'] },
  { type: 'row', cells: ['Бонус за регулярность', 'закупать каждый месяц', 'товарный бонус на следующий заказ', 'регулярность считается от 15 000 ₽ без НДС'] },
  { type: 'row', cells: ['Бонус за рост заказа', 'увеличить сумму к прошлому заказу', 'дополнительный товарный бонус', 'расчет подтверждает менеджер'] },
  { type: 'row', cells: ['Бонус за ширину ассортимента', 'добавить больше SKU в заказ', 'образцы, бонусные позиции, расширенные условия', 'бонусы не автоматические'] },
  { type: 'row', cells: ['Ретробонус', 'выполнять согласованный план закупок', 'бонус по итогам месяца или квартала', 'для Партнера и Ключевого партнера'] },
  { type: 'gap' },
  { type: 'section', text: '3. Бонус за регулярность' },
  { type: 'head', cells: ['Регулярность закупок', 'Возможное преимущество', 'Уточнение', ''] },
  { type: 'row', cells: ['2 месяца подряд', 'образцы новинок или небольшой товарный бонус в следующий заказ', 'заказы от 15 000 ₽ без НДС', ''] },
  { type: 'row', cells: ['3 месяца подряд', 'повышенный товарный бонус в следующий заказ', 'при отсутствии просрочки', ''] },
  { type: 'row', cells: ['6 месяцев подряд', 'возможность индивидуальных условий и участия в ретробонусной программе', 'согласуется индивидуально', ''] },
  { type: 'gap' },
  { type: 'section', text: '4. Бонус за рост заказа' },
  { type: 'head', cells: ['Рост к предыдущему заказу', 'Возможное преимущество', 'Защита от некорректного расчета', ''] },
  { type: 'row', cells: ['рост 15%', '+2% товарный бонус', 'сравнение с предыдущей сопоставимой закупкой', ''] },
  { type: 'row', cells: ['рост 25%', '+3% товарный бонус', 'условия подтверждает менеджер', ''] },
  { type: 'row', cells: ['рост 40%+', 'индивидуальный бонус или расширенные условия', 'исключается сравнение со случайно малым заказом', ''] },
  { type: 'gap' },
  { type: 'section', text: '5. Бонус за ширину ассортимента' },
  { type: 'head', cells: ['Количество SKU в заказе', 'Возможное преимущество', 'Коммерческий смысл', ''] },
  { type: 'row', cells: ['от 10 SKU', 'образцы новинок для тестирования', 'расширяем будущую закупку', ''] },
  { type: 'row', cells: ['от 20 SKU', 'товарный бонус (+2-3% от суммы заказа) или расширенный набор образцов', 'увеличивает долю ПЧК в ассортименте', ''] },
  { type: 'row', cells: ['от 30 SKU', 'повышенный товарный бонус (+4% от суммы заказа) или индивидуальное условие', 'широкая матрица — залог хороших продаж', ''] },
  { type: 'gap' },
  { type: 'section', text: '6. Ретробонус' },
  { type: 'head', cells: ['Уровень клиента', 'Ретробонус', 'Комментарий', ''] },
  { type: 'row', cells: ['Базовый', 'не применяется', 'стартовый уровень', ''] },
  { type: 'row', cells: ['Опт', 'не применяется', 'стандартный опт', ''] },
  { type: 'row', cells: ['Опт+', 'возможен только как исключение', 'по решению руководителя', ''] },
  { type: 'row', cells: ['Партнер', 'может быть согласован по итогам периода', 'месяц или квартал', ''] },
  { type: 'row', cells: ['Ключевой партнер', 'может быть согласован индивидуально', 'при регулярности и платежной дисциплине', ''] },
  { type: 'gap' },
  { type: 'section', text: '7. Образцы и новинки' },
  { type: 'head', cells: ['Основание', 'Возможное преимущество', 'Комментарий', ''] },
  { type: 'row', cells: ['заказ от уровня Опт+', 'образцы новинок', 'по согласованию с менеджером', ''] },
  { type: 'row', cells: ['расширение ассортимента', 'дегустационный набор', 'под профиль клиента', ''] },
  { type: 'row', cells: ['регулярные закупки', 'ранний доступ к новым позициям', 'не является обязательным бонусом', ''] },
  { type: 'row', cells: ['крупный заказ', 'индивидуальная подборка образцов', 'с учетом задач клиента', ''] },
  { type: 'gap' },
  { type: 'section', text: '8. Ограничения программы' },
  { type: 'head', cells: ['Условие', 'Правило', 'Комментарий', ''] },
  { type: 'row', cells: ['есть просроченная задолженность', 'бонусы и специальные условия не применяются', 'до полного закрытия долга', ''] },
  { type: 'row', cells: ['предоставлена отсрочка платежа', 'бонусы могут быть ограничены', 'согласуется индивидуально', ''] },
  { type: 'row', cells: ['специальная цена', 'дополнительные бонусы согласуются отдельно', 'без автоматического суммирования', ''] },
  { type: 'row', cells: ['акционная или распродажная позиция', 'бонусы могут не применяться', 'по решению менеджера', ''] },
  { type: 'row', cells: ['индивидуальные условия', 'финально подтверждаются менеджером', 'после проверки заказа', ''] },
  { type: 'gap' },
  { type: 'section', text: '9. Как воспользоваться программой' },
  { type: 'head', cells: ['Шаг', 'Действие', 'Результат', ''] },
  { type: 'row', cells: ['1', 'Укажите количество на листе «Прайс-лист»', 'бланк заказа соберется автоматически', ''] },
  { type: 'row', cells: ['2', 'Проверьте сумму и предварительный уровень', 'будет виден добор до следующего уровня', ''] },
  { type: 'row', cells: ['3', 'Отправьте файл менеджеру', 'менеджер проверит наличие, цены и бонусы', ''] },
  { type: 'row', cells: ['4', 'Согласуйте регулярный формат закупок', 'можно получить больше партнерских преимуществ', ''] },
  { type: 'gap' },
  { type: 'outro', text: 'Хотите получать больше преимуществ от регулярных закупок? Заполните заказ или напишите менеджеру — мы рассчитаем ваш уровень, возможные бонусы и условия следующей закупки.' },
]

function buildPartnerSheet(wb) {
  const ws = wb.addWorksheet('Партнерская программа', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [{ width: 28 }, { width: 36 }, { width: 44 }, { width: 30 }]

  let r = 1
  for (const item of PARTNER_PROGRAM) {
    if (item.type === 'gap') { r++; continue }
    const row = ws.getRow(r)
    if (item.cells) {
      item.cells.forEach((text, i) => {
        const c = row.getCell(1 + i)
        c.value = text
        c.border = BORDER_THIN
        c.alignment = { vertical: 'middle', wrapText: true, horizontal: item.type === 'head' ? 'center' : 'left' }
        if (item.type === 'head') {
          c.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
          c.fill = fill(C.pgHead)
        }
      })
    } else {
      ws.mergeCells(`A${r}:D${r}`)
      const c = row.getCell(1)
      c.value = item.text
      c.alignment = { vertical: 'middle', wrapText: true, horizontal: item.type === 'title' ? 'center' : 'left' }
      if (item.type === 'title')   { c.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(C.pgHead); row.height = 30 }
      if (item.type === 'lead')    { c.font = { size: 12, bold: true, color: { argb: 'FF111827' } }; c.fill = fill(C.pgGold) }
      if (item.type === 'intro')   { c.font = { size: 9, color: { argb: 'FF374151' } };              c.fill = fill(C.pgSoft) }
      if (item.type === 'section') { c.font = { bold: true, color: { argb: 'FFFFFFFF' } };           c.fill = fill(C.pgSub) }
      if (item.type === 'outro')   { c.font = { size: 10, bold: true, color: { argb: 'FF111827' } }; c.fill = fill(C.pgSoft); row.height = 40 }
    }
    r++
  }
}

// ---------- Лист «Условия работы» -------------------------------------------

function buildTermsSheet(wb, withVat) {
  const vatWord = withVat ? 'с НДС' : 'без НДС'
  const ws = wb.addWorksheet('Условия работы', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [{ width: 4 }, { width: 28 }, { width: 95 }]

  ;['A1', 'B1', 'C1'].forEach((a, i) => {
    const c = ws.getCell(a)
    c.value = i === 2 ? 'Условия работы' : (i === 0 ? '№' : '')
    c.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = fill(C.dark)
  })

  const terms = [
    ['Как оформить заказ', 'Укажите количество на листе «Прайс-лист». Выбранные позиции автоматически попадут в «Бланк заказа». После этого отправьте файл менеджеру.'],
    ['Минимальный заказ', `Минимальная сумма заказа — 18 000 ₽ ${vatWord}.`],
    ['Подтверждение заказа', 'Цены, наличие, бонусы и специальные условия подтверждаются менеджером. Прайс-лист не является публичной офертой.'],
    ['Оплата', 'Для новых клиентов первая отгрузка осуществляется по 100% предоплате. Индивидуальные условия возможны после согласования и при отсутствии задолженности.'],
    ['Отсрочка платежа', 'Отсрочка может быть согласована индивидуально для регулярных клиентов с положительной историей оплат. При отсрочке бонусы могут быть ограничены.'],
    ['Доставка', 'Условия доставки согласуются с менеджером после подтверждения заказа. Возможны самовывоз, транспортная компания или иной согласованный способ.'],
    ['Партнерские преимущества', 'Бонусы, ретробонусы, образцы и специальные условия применяются после подтверждения менеджером и доступны только клиентам без просроченной задолженности.'],
  ]
  terms.forEach(([title, text], i) => {
    const r = 3 + i
    const a = ws.getCell(`A${r}`); a.value = i + 1
    const b = ws.getCell(`B${r}`); b.value = title
    const c = ws.getCell(`C${r}`); c.value = text
    ;[a, b].forEach(cell => { cell.font = { bold: true }; cell.fill = fill(C.sand) })
    c.fill = fill(C.paper)
    ;[a, b, c].forEach(cell => {
      cell.border = BORDER_DASHED
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: cell === a ? 'center' : 'left' }
    })
  })
}

// ---------- Лист «Служебный лист» -------------------------------------------

function buildServiceSheet(wb, range, withVat) {
  const { firstDataRow: F, lastDataRow: L } = range
  const ws = wb.addWorksheet('Служебный лист', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 31.7 }, { width: 53.4 }, { width: 47.4 }]

  const h1 = ws.getCell('A1'); h1.value = 'Ставка НДС'
  const h2 = ws.getCell('B1'); h2.value = withVat ? VAT_RATE : 0; h2.numFmt = '0%'
  ;[h1, h2].forEach(c => {
    c.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = fill(C.dark)
  })

  const heads = ['Уровень', 'Порог заказа', 'Комментарий']
  heads.forEach((t, i) => {
    const c = ws.getRow(3).getCell(1 + i)
    c.value = t
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = fill(C.dark)
    c.border = BORDER_DASHED
  })

  const comments = [
    'Минимальный заказ / базовый уровень',
    'Стандартный оптовый уровень',
    'Усиленные условия',
    'Частично индивидуальные условия',
    'Индивидуальные условия',
  ]
  TIER_LABELS.forEach((label, i) => {
    const r = 4 + i
    ws.getCell(`A${r}`).value = label
    const b = ws.getCell(`B${r}`)
    b.value = TIER_THRESHOLDS[i]
    b.numFmt = '#,##0" ₽"'
    ws.getCell(`C${r}`).value = comments[i]
    ;['A', 'B', 'C'].forEach(col => { ws.getCell(`${col}${r}`).border = BORDER_DASHED })
  })

  ws.getCell('A10').value = 'Кол-во SKU'
  ws.getCell('B10').value = 'Подсказка'
  ;['A10', 'B10'].forEach(a => { ws.getCell(a).font = { bold: true } })
  const hints = [
    ['10+', 'Возможны образцы новинок'],
    ['20+', 'Возможен бонус за ширину ассортимента'],
    ['30+', 'Возможен расширенный бонус за ширину ассортимента'],
  ]
  hints.forEach(([k, v], i) => {
    ws.getCell(`A${11 + i}`).value = k
    ws.getCell(`B${11 + i}`).value = v
  })

  ws.getCell('A15').value = 'Сумма заказа по Базовым ценам'
  ws.getCell('B15').value = { formula: `SUMPRODUCT('Прайс-лист'!$L$${F}:$L$${L},'Прайс-лист'!$G$${F}:$G$${L})` }
  ws.getCell('B15').numFmt = '#,##0.00" ₽"'
  ws.getCell('C15').value = 'Используется для авто-определения уровня клиента'
}

// ---------- Публичный API ----------------------------------------------------

/**
 * Собирает книгу клиентского прайс-листа.
 *
 * @param {Array<Object>} rows  строки pricelist_export_v1
 * @param {Object} opts
 *   - withVat     {boolean} цены с НДС 22% (по умолчанию true)
 *   - dateStr     {string}  дата выгрузки
 *   - managerName {string}  имя менеджера в «Бланке заказа»
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildClientPriceListBuffer(rows, opts = {}) {
  const options = {
    withVat: opts.withVat ?? true,
    dateStr: opts.dateStr ?? new Date().toLocaleDateString('ru-RU'),
    managerName: opts.managerName ?? '',
  }

  const sorted = [...rows].sort((a, b) => (a.item_sort ?? 0) - (b.item_sort ?? 0))
  if (sorted.length === 0) throw new Error('Нет позиций для выгрузки')

  const blocks = buildBlocks(sorted)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ПЧК — Tea Production DB'
  wb.created = new Date()

  const range = buildPriceSheet(wb, blocks, options)
  buildOrderSheet(wb, sorted.length, range, options)
  buildPartnerSheet(wb)
  buildTermsSheet(wb, options.withVat)
  buildServiceSheet(wb, range, options.withVat)

  return wb.xlsx.writeBuffer()
}

export function clientPriceListFileName(count, withVat, dateStr) {
  const d = (dateStr ?? new Date().toLocaleDateString('ru-RU')).replace(/\./g, '-')
  return `Клиентский прайс ПЧК (бланк заказов), ${withVat ? 'с НДС' : 'без НДС'} (${count} поз) ${d}.xlsx`
}

// ---------- Загрузка данных и скачивание -------------------------------------

/**
 * Тянет строки прайса из view `pricelist_export_v1`.
 * @param {object} supabase   клиент Supabase
 * @param {string[]|null} articles  ограничить набор артикулов (null = все)
 */
export async function fetchPriceListRows(supabase, articles = null) {
  const { data, error } = await supabase
    .from('pricelist_export_v1')
    .select('*')
    .order('item_sort', { ascending: true })
    .limit(5000)
  if (error) throw new Error(`Не удалось загрузить прайс: ${error.message}`)
  if (!articles) return data ?? []
  const keep = new Set(articles)
  return (data ?? []).filter(r => keep.has(r.sku_article))
}

/** Собирает книгу и отдаёт её браузеру как файл. */
export async function downloadClientPriceList(rows, opts = {}) {
  const buffer = await buildClientPriceListBuffer(rows, opts)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = clientPriceListFileName(rows.length, opts.withVat ?? true, opts.dateStr)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return rows.length
}
