import { type IsoDate, type MonthId, monthOf, nextMonth, previousMonth } from '../schedule/dates'

// The team's calendar is São Paulo's, whatever the device's time zone.

const SAO_PAULO_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

export function today(): IsoDate {
  return SAO_PAULO_DATE.format(new Date())
}

const OPENING_DAY = 20

/** The month people care about: the current one, and from the 20th on the next one (decisions #26). */
export function defaultMonth(date: IsoDate = today()): MonthId {
  const isAfterOpening = Number(date.slice(8)) >= OPENING_DAY
  return isAfterOpening ? nextMonth(monthOf(date)) : monthOf(date)
}

/** Months open on the 20th of the month before. */
export function opensOn(month: MonthId): IsoDate {
  return `${previousMonth(month)}-${OPENING_DAY}`
}
