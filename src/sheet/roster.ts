import { daysOfMonth, type IsoDate, type MonthId, makeDate, monthOf } from '../schedule/dates'
import { type DayKind, type Segment, type ShiftDay, shiftLength, shiftStartHour } from '../schedule/shifts'
import { parseCsv } from './csv'

// Reads the Banking roster out of the manager's sheet exported as CSV (decisions #16, #23).
// One parser for the starting-balance import and for the swap sync.
//
// Sheet layout, as exported: a row of dates (one date heads the 3 team columns of its day), a row of
// team labels (Sustentação, Banking, Infra), then one row per hour 0:00…23:00 where each cell holds
// the nickname on call in that hour. During office hours of a workday the sheet says "Expediente".
// Columns are found by date and label, never by position (decisions #4).

const BANKING_LABEL = 'banking'
const OFFICE_HOURS_MARKER = 'expediente'
const HOURS_PER_DAY = 24
const OFFICE_HOURS = { from: 9, to: 18 }
const PREVIOUS_SHIFT_ENDS_AT_HOUR = 9

export type SheetFormatProblem =
  | 'no_dates'
  | 'dates_not_one_full_month'
  | 'no_banking_column'
  | 'missing_hours'

/** The file is not a sheet we can read. `code` lets the API show a message in Portuguese. */
export class SheetFormatError extends Error {
  constructor(readonly code: SheetFormatProblem) {
    super(`Unreadable sheet: ${code}`)
    this.name = 'SheetFormatError'
  }
}

/**
 * - `partly_assigned`: some hours of the shift have a name and others are empty.
 * - `names_in_office_hours`: a workday has names between 09:00 and 18:00, which no shift covers.
 */
export type SheetDayProblem = { date: IsoDate; problem: 'partly_assigned' | 'names_in_office_hours' }

export type SheetRoster = {
  month: MonthId
  /** Devs are identified by the nickname written in the sheet. */
  days: ShiftDay<string>[]
  /** Hours of day 1 before 09:00, which belong to the previous month's last shift. */
  hoursFromPreviousMonth: Map<string, number>
  problems: SheetDayProblem[]
}

type DayColumns = { date: IsoDate; firstColumn: number; endColumn: number; bankingColumn: number }

export function readSheetRoster(csvText: string): SheetRoster {
  const rows = parseCsv(csvText)
  const columns = findDayColumns(rows)
  const hourRows = findHourRows(rows)
  const cellText = (hour: number, column: number) => (hourRows[hour]?.[column] ?? '').trim()
  const nicknameAt = (hour: number, column: number) => {
    const text = cellText(hour, column)
    const isOfficeHoursMarker = text.toLowerCase() === OFFICE_HOURS_MARKER
    return isOfficeHoursMarker ? '' : text
  }

  const problems: SheetDayProblem[] = []
  const kinds = columns.map((day) => dayKindOf(day, cellText))

  const days = columns.map((day, index): ShiftDay<string> => {
    const kind = kinds[index] ?? 'workday'
    const nextDay = columns[index + 1]
    const hourlyNicknames = shiftNicknames(kind, day, nextDay, nicknameAt)
    const isLastDayOfSheet = nextDay === undefined
    const segments = toSegments(isLastDayOfSheet ? extendLastNickname(hourlyNicknames) : hourlyNicknames)

    const hasEmptyHour = hourlyNicknames.some((nickname) => nickname === '')
    const hasNamedHour = hourlyNicknames.some((nickname) => nickname)
    if (hasEmptyHour && hasNamedHour) problems.push({ date: day.date, problem: 'partly_assigned' })

    const hasNamesInOfficeHours =
      kind === 'workday' &&
      range(OFFICE_HOURS.from, OFFICE_HOURS.to).some((hour) => nicknameAt(hour, day.bankingColumn) !== '')
    if (hasNamesInOfficeHours) problems.push({ date: day.date, problem: 'names_in_office_hours' })

    return { date: day.date, kind, segments }
  })

  const firstDay = columns[0]
  const hoursFromPreviousMonth = new Map<string, number>()
  for (const hour of range(0, PREVIOUS_SHIFT_ENDS_AT_HOUR)) {
    const nickname = firstDay ? nicknameAt(hour, firstDay.bankingColumn) : ''
    if (nickname) hoursFromPreviousMonth.set(nickname, (hoursFromPreviousMonth.get(nickname) ?? 0) + 1)
  }

  return { month: monthOf(firstDay?.date ?? ''), days, hoursFromPreviousMonth, problems }
}

/** A workday is a day whose office hours say "Expediente" in any of its team columns. */
function dayKindOf(day: DayColumns, cellText: (hour: number, column: number) => string): DayKind {
  const hasOfficeHoursMarker = range(OFFICE_HOURS.from, OFFICE_HOURS.to).some((hour) =>
    range(day.firstColumn, day.endColumn).some(
      (column) => cellText(hour, column).toLowerCase() === OFFICE_HOURS_MARKER,
    ),
  )
  return hasOfficeHoursMarker ? 'workday' : 'day_off'
}

/**
 * The nickname of each hour of the day's shift, from its start until 09:00 the next day. `null`
 * marks hours that are not in the sheet (the last day's shift runs into the next month).
 */
function shiftNicknames(
  kind: DayKind,
  day: DayColumns,
  nextDay: DayColumns | undefined,
  nicknameAt: (hour: number, column: number) => string,
): (string | null)[] {
  const startHour = shiftStartHour(kind)
  const hoursOnStartDay = range(startHour, HOURS_PER_DAY).map((hour) => nicknameAt(hour, day.bankingColumn))
  const hoursOnNextDay = range(0, shiftLength(kind) - hoursOnStartDay.length).map((hour) =>
    nextDay ? nicknameAt(hour, nextDay.bankingColumn) : null,
  )
  return [...hoursOnStartDay, ...hoursOnNextDay]
}

/** The month's last shift ends next month, outside the sheet: whoever holds its last hour keeps it. */
function extendLastNickname(hourlyNicknames: (string | null)[]): (string | null)[] {
  let lastNickname: string | null = null
  return hourlyNicknames.map((nickname) => {
    if (nickname !== null) lastNickname = nickname
    return nickname ?? lastNickname
  })
}

/** Groups consecutive hours of the same nickname. Empty hours give no segment. */
function toSegments(hourlyNicknames: (string | null)[]): Segment<string>[] {
  const segments: Segment<string>[] = []
  hourlyNicknames.forEach((nickname, hour) => {
    if (!nickname) return
    const previous = segments.at(-1)
    const continuesPrevious = previous?.devId === nickname && previous.toHour === hour
    if (continuesPrevious) previous.toHour = hour + 1
    else segments.push({ devId: nickname, fromHour: hour, toHour: hour + 1 })
  })
  return segments
}

function findDayColumns(rows: string[][]): DayColumns[] {
  const dateRow = rows.find((row) => row.some((cell) => SHEET_DATE.test(cell.trim())))
  if (!dateRow) throw new SheetFormatError('no_dates')
  const dateCells = dateRow.flatMap((cell, column) =>
    SHEET_DATE.test(cell.trim()) ? [{ column, cell }] : [],
  )
  const dates = readDatesOfOneMonth(dateCells.map(({ cell }) => cell.trim()))

  const labelRow = rows.find((row) => row.some((cell) => cell.trim().toLowerCase() === BANKING_LABEL))
  return dateCells.map(({ column }, index) => {
    const endColumn = dateCells[index + 1]?.column ?? dateRow.length
    const bankingColumn = range(column, endColumn).find(
      (labelColumn) => labelRow?.[labelColumn]?.trim().toLowerCase() === BANKING_LABEL,
    )
    if (bankingColumn === undefined) throw new SheetFormatError('no_banking_column')
    return { date: dates[index] ?? '', firstColumn: column, endColumn, bankingColumn }
  })
}

const SHEET_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/**
 * Excel writes dates in the exporting machine's locale: `11/1/2026` (month first) or `01/11/2026`
 * (day first). The right reading is the one that gives every day of one month, in order.
 */
function readDatesOfOneMonth(dateTexts: string[]): IsoDate[] {
  const parts = dateTexts.map((text) => (SHEET_DATE.exec(text) ?? []).slice(1).map(Number))
  const readings = [
    parts.map(([month, day, year]) => makeDate(year ?? 0, month ?? 0, day ?? 0)),
    parts.map(([day, month, year]) => makeDate(year ?? 0, month ?? 0, day ?? 0)),
  ]
  const isOneFullMonth = (dates: IsoDate[]) => {
    const expected = daysOfMonth(monthOf(dates[0] ?? ''))
    return dates.length === expected.length && dates.every((date, index) => date === expected[index])
  }
  const fullMonth = readings.find(isOneFullMonth)
  if (!fullMonth) throw new SheetFormatError('dates_not_one_full_month')
  return fullMonth
}

const HOUR_LABEL = /^(\d{1,2}):00(:00)?$/

/** Row of each hour 0–23, found by the label in the first column (`0:00`, `13:00`…). */
function findHourRows(rows: string[][]): string[][] {
  const rowsByHour: string[][] = []
  for (const row of rows) {
    const hourText = HOUR_LABEL.exec((row[0] ?? '').trim())?.[1]
    if (hourText !== undefined) rowsByHour[Number(hourText)] ??= row
  }
  const hasEveryHour = range(0, HOURS_PER_DAY).every((hour) => rowsByHour[hour] !== undefined)
  if (!hasEveryHour) throw new SheetFormatError('missing_hours')
  return rowsByHour
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index)
}
