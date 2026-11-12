// Calendar helpers on plain strings: dates are `YYYY-MM-DD`, months are `YYYY-MM`.
// All arithmetic goes through UTC so the host time zone never shifts a day.

export type IsoDate = string
export type MonthId = string

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

function toUtcDate(date: IsoDate): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
}

function fromUtcDate(utcDate: Date): IsoDate {
  return utcDate.toISOString().slice(0, 10)
}

export function makeDate(year: number, month: number, day: number): IsoDate {
  return fromUtcDate(new Date(Date.UTC(year, month - 1, day)))
}

export function addDays(date: IsoDate, amount: number): IsoDate {
  return fromUtcDate(new Date(toUtcDate(date).getTime() + amount * MILLISECONDS_PER_DAY))
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: IsoDate): number {
  return toUtcDate(date).getUTCDay()
}

export function monthOf(date: IsoDate): MonthId {
  return date.slice(0, 7)
}

export function daysOfMonth(month: MonthId): IsoDate[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const firstDay = makeDate(year ?? 0, monthNumber ?? 1, 1)
  const dates: IsoDate[] = []
  for (let date = firstDay; monthOf(date) === month; date = addDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

export function previousMonth(month: MonthId): MonthId {
  return monthOf(addDays(`${month}-01`, -1))
}
