import { addDays, daysOfMonth, type IsoDate, type MonthId, monthOf } from '../schedule/dates'
import { type ShiftDay, shiftStartHour } from '../schedule/shifts'

// Writing the month back to the manager's sheet (decisions #4): the Banking cell of every calendar
// hour, as an Office Script that finds the columns by date and label, or as a grid to paste with
// "Paste Special → Skip blanks" when Office Scripts are not available.

const HOURS_PER_DAY = 24
const OFFICE_HOURS = { from: 9, to: 18 }

/**
 * What to do with one Banking cell: write a nickname, clear it (`''`, office hours of a workday),
 * or leave it alone (`null`: an hour no shift of this month covers).
 */
export type BankingCell = string | null

/**
 * The Banking cells of every day of `month`, hour 0–23. Pass the month's days **and** the previous
 * month's last day: its shift fills the morning of day 1.
 */
export function bankingCells(month: MonthId, days: ShiftDay<string>[]): Map<IsoDate, BankingCell[]> {
  const cells = new Map<IsoDate, BankingCell[]>(
    daysOfMonth(month).map((date) => [date, Array<BankingCell>(HOURS_PER_DAY).fill(null)]),
  )
  for (const day of days) {
    const isWorkday = day.kind === 'workday'
    const dayCells = cells.get(day.date)
    if (isWorkday && dayCells) dayCells.fill('', OFFICE_HOURS.from, OFFICE_HOURS.to)

    for (const segment of day.segments) {
      for (let shiftHour = segment.fromHour; shiftHour < segment.toHour; shiftHour++) {
        const clockHour = shiftStartHour(day.kind) + shiftHour
        const date = clockHour >= HOURS_PER_DAY ? addDays(day.date, 1) : day.date
        const isInMonth = monthOf(date) === month
        if (isInMonth) (cells.get(date) as BankingCell[])[clockHour % HOURS_PER_DAY] = segment.devId
      }
    }
  }
  return cells
}

const TEAM_LABELS = ['Sustentação', 'Banking', 'Infra']

/**
 * The sheet's layout with only the Banking cells filled: one date over its three team columns, a
 * row of team labels, then one row per hour. Pasted over the sheet with "Skip blanks", it changes
 * nothing but the Banking cells. Cleared cells cannot be pasted, so they are left blank.
 */
export function pasteGrid(cells: Map<IsoDate, BankingCell[]>): string[][] {
  const dates = [...cells.keys()].sort()
  const dayFirst = (date: IsoDate) =>
    `${Number(date.slice(8))}/${Number(date.slice(5, 7))}/${date.slice(0, 4)}`
  return [
    ['Horário', ...dates.flatMap((date) => [dayFirst(date), '', ''])],
    ['Time', ...dates.flatMap(() => TEAM_LABELS)],
    ...Array.from({ length: HOURS_PER_DAY }, (_, hour) => [
      `${hour}:00`,
      ...dates.flatMap((date) => ['', cells.get(date)?.[hour] || '', '']),
    ]),
  ]
}

/** The Office Script (Excel → Automate → New script) that writes `cells` into the active sheet. */
export function officeScript(month: MonthId, cells: Map<IsoDate, BankingCell[]>): string {
  const banking = JSON.stringify(Object.fromEntries(cells))
  return `// Coruja: escala de sobreaviso do Banking, ${month}.
// Preenche só a coluna Banking de cada dia, achando as colunas pela data e pelo rótulo "Banking".
// Abra a aba do mês na planilha do gestor e execute.

const MONTH = ${JSON.stringify(month)};
const BANKING: { [date: string]: (string | null)[] } = ${banking};

function main(workbook: ExcelScript.Workbook) {
  const sheet = workbook.getActiveWorksheet();
  const used = sheet.getUsedRange();
  if (!used) throw new Error("A aba está vazia. Abra a aba de " + MONTH + ".");
  const values = used.getValues();
  const texts = used.getTexts();
  const top = used.getRowIndex();
  const left = used.getColumnIndex();
  const textAt = (row: number, column: number) => String(texts[row][column] ?? "").trim();

  const dateColumns = findDateColumns(values, texts);
  const dateCount = Object.keys(BANKING).length;
  if (dateColumns.length < dateCount) {
    throw new Error("Não achei as datas de " + MONTH + " nesta aba (achei " + dateColumns.length + " de " + dateCount + "). Abra a aba do mês certo.");
  }

  const labelRow = texts.findIndex((row) => row.some((cell) => String(cell).trim().toLowerCase() === "banking"));
  if (labelRow < 0) throw new Error('Não achei o rótulo "Banking" nesta aba.');

  const hourRows: number[] = [];
  values.forEach((row, index) => {
    const hour = hourOf(row[0], String(texts[index][0] ?? "").trim());
    if (hour !== null && hourRows[hour] === undefined) hourRows[hour] = index;
  });
  for (let hour = 0; hour < 24; hour++) {
    if (hourRows[hour] === undefined) throw new Error("Não achei a linha das " + hour + ":00 nesta aba.");
  }

  let written = 0;
  const missingBanking: string[] = [];
  const skipped: string[] = [];
  for (const date of Object.keys(BANKING)) {
    const index = dateColumns.findIndex((found) => found.date === date);
    const end = index + 1 < dateColumns.length ? dateColumns[index + 1].column : texts[labelRow].length;
    let column = -1;
    for (let candidate = dateColumns[index].column; candidate < end; candidate++) {
      if (textAt(labelRow, candidate).toLowerCase() === "banking") {
        column = candidate;
        break;
      }
    }
    if (column < 0) {
      missingBanking.push(date);
      continue;
    }
    BANKING[date].forEach((wanted, hour) => {
      if (wanted === null) return;
      const row = hourRows[hour];
      const current = textAt(row, column);
      if (current.toLowerCase() === "expediente") {
        if (wanted !== "") skipped.push(date + " " + hour + ":00");
        return;
      }
      if (current === wanted) return;
      sheet.getCell(top + row, left + column).setValue(wanted);
      written++;
    });
  }

  console.log("Coruja: " + written + " células da coluna Banking atualizadas.");
  if (missingBanking.length > 0) console.log('Dias sem coluna "Banking": ' + missingBanking.join(", "));
  if (skipped.length > 0) console.log('Horas com "Expediente" que deixei como estavam: ' + skipped.join(", "));
}

/** Date cells are Excel serial numbers, or text written day first or month first. */
function findDateColumns(values: (string | number | boolean)[][], texts: string[][]) {
  const wanted = Object.keys(BANKING);
  let best: { date: string; column: number }[] = [];
  values.forEach((row, rowIndex) => {
    for (const dayFirst of [true, false]) {
      const found: { date: string; column: number }[] = [];
      row.forEach((value, column) => {
        const date = dateOf(value, String(texts[rowIndex][column] ?? "").trim(), dayFirst);
        if (date !== null && wanted.indexOf(date) >= 0) found.push({ date, column });
      });
      if (found.length > best.length) best = found;
    }
  });
  return best;
}

function dateOf(value: string | number | boolean, text: string, dayFirst: boolean): string | null {
  if (typeof value === "number" && value > 30000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const parts = /^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/.exec(text);
  if (!parts) return null;
  const day = Number(dayFirst ? parts[1] : parts[2]);
  const monthNumber = Number(dayFirst ? parts[2] : parts[1]);
  const pad = (number: number) => (number < 10 ? "0" : "") + number;
  return parts[3] + "-" + pad(monthNumber) + "-" + pad(day);
}

/** Hour labels are times (a fraction of a day) or text like "13:00". */
function hourOf(value: string | number | boolean, text: string): number | null {
  if (typeof value === "number" && value >= 0 && value < 1) return Math.round(value * 24);
  const parts = /^(\\d{1,2}):00(:00)?$/.exec(text);
  return parts ? Number(parts[1]) : null;
}
`
}
