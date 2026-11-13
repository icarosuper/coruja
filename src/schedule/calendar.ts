import { type IsoDate, type MonthId, monthOf, nextMonth } from './dates'

// The team's calendar is São Paulo's, whatever the device's (or the Worker's) time zone.

const SAO_PAULO_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

/** The date in São Paulo at `instant`. */
export function saoPauloDate(instant: Date): IsoDate {
  return SAO_PAULO_DATE.format(instant)
}

/** From this day on, the month being confirmed is the next one. */
const NEXT_MONTH_DAY = 20

/** The month people care about: the current one, and from the 20th on the next one (decisions #26). */
export function defaultMonth(date: IsoDate): MonthId {
  const isLateInMonth = Number(date.slice(8)) >= NEXT_MONTH_DAY
  return isLateInMonth ? nextMonth(monthOf(date)) : monthOf(date)
}
