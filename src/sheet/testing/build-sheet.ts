import { addDays, daysOfMonth, type IsoDate } from '../../schedule/dates'
import { type DayKind, defaultCalendar } from '../../schedule/shifts'

// Test-only: builds the manager's sheet as CSV in code, with made-up nicknames, so the real sheet
// never enters the repo.

export type SheetOptions = {
  month: string
  kindOf?: (date: IsoDate) => DayKind
  /** Banking cell of a calendar hour. */
  bankingAt: (date: IsoDate, hour: number) => string
  dateFormat?: 'month_first' | 'day_first'
  delimiter?: ',' | ';'
}

export function buildSheet({
  month,
  kindOf,
  bankingAt,
  dateFormat = 'month_first',
  delimiter = ',',
}: SheetOptions): string {
  const calendar = defaultCalendar(month)
  const kind = (date: IsoDate) => kindOf?.(date) ?? calendar.find((day) => day.date === date)?.kind
  const dates = daysOfMonth(month)
  const formatDate = (date: IsoDate) => {
    const [year, monthNumber, day] = date.split('-').map(Number)
    return dateFormat === 'month_first' ? `${monthNumber}/${day}/${year}` : `${day}/${monthNumber}/${year}`
  }
  const rows = [
    ['Horário', ...dates.flatMap((date) => [formatDate(date), '', ''])],
    ['', ...dates.flatMap(() => ['', '', ''])],
    ['Time', ...dates.flatMap(() => ['Sustentação', 'Banking', 'Infra'])],
    ...Array.from({ length: 24 }, (_, hour) => [
      `${hour}:00`,
      ...dates.flatMap((date) => {
        const isOfficeHours = kind(date) === 'workday' && hour >= 9 && hour < 18
        return isOfficeHours ? ['Expediente', '', ''] : ['', bankingAt(date, hour), 'infra-dev']
      }),
    ]),
    ['', 'AGENTE', '', 'HORAS'],
  ]
  return rows.map((row) => row.join(delimiter)).join('\r\n')
}

/** Who holds each shift: the shift of `date` covers its evening (or whole day) and the next morning. */
export function bankingByShift(ownerOf: (shiftDate: IsoDate) => string) {
  return (date: IsoDate, hour: number) => {
    const isPreviousShiftMorning = hour < 9
    const shiftDate = isPreviousShiftMorning ? addDays(date, -1) : date
    return ownerOf(shiftDate)
  }
}
