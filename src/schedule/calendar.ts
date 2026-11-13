import { type IsoDate, type MonthId, monthOf, nextMonth, previousMonth } from './dates'

// The team's calendar is São Paulo's, whatever the device's (or the Worker's) time zone.

const SAO_PAULO_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

/** The date in São Paulo at `instant`. */
export function saoPauloDate(instant: Date): IsoDate {
  return SAO_PAULO_DATE.format(instant)
}

const OPENING_DAY = 20

/** The month people care about: the current one, and from the 20th on the next one (decisions #26). */
export function defaultMonth(date: IsoDate): MonthId {
  const isAfterOpening = Number(date.slice(8)) >= OPENING_DAY
  return isAfterOpening ? nextMonth(monthOf(date)) : monthOf(date)
}

/** Months open on the 20th of the month before. */
export function opensOn(month: MonthId): IsoDate {
  return `${previousMonth(month)}-${OPENING_DAY}`
}

/**
 * The months the cron opens on `date`, in order: every month after `newestMonth` up to the default
 * one, so a missed run catches up. None before the first month exists: Coruja starts from an
 * import or a month opened by hand.
 */
export function monthsDueToOpen(newestMonth: MonthId | null, date: IsoDate): MonthId[] {
  if (newestMonth === null) return []
  const due: MonthId[] = []
  for (let month = nextMonth(newestMonth); month <= defaultMonth(date); month = nextMonth(month)) {
    due.push(month)
  }
  return due
}
