import { addDays, daysOfMonth, type IsoDate, type MonthId, monthOf, weekdayOf } from './dates'
import { saoPauloHolidays } from './holidays'

// Shift rules (decisions #2, #14, #15). A shift belongs to the day it starts; its hours count in
// the calendar month each hour falls in.

export const DAY_KINDS = ['workday', 'day_off'] as const
export type DayKind = (typeof DAY_KINDS)[number]

const SHIFT_START_HOUR: Record<DayKind, number> = { workday: 18, day_off: 9 }
const SHIFT_LENGTH_HOURS: Record<DayKind, number> = { workday: 15, day_off: 24 }
const HOURS_PER_DAY = 24
const SATURDAY = 6
const SUNDAY = 0

export function shiftLength(kind: DayKind): number {
  return SHIFT_LENGTH_HOURS[kind]
}

export type CalendarDay = { date: IsoDate; kind: DayKind; holidayName: string | null }

/** The month's days as they are when it opens: weekends and São Paulo holidays are 24h days. */
export function defaultCalendar(month: MonthId): CalendarDay[] {
  const year = Number(month.slice(0, 4))
  const holidays = saoPauloHolidays(year)
  return daysOfMonth(month).map((date) => {
    const weekday = weekdayOf(date)
    const isWeekend = weekday === SATURDAY || weekday === SUNDAY
    const holidayName = holidays.get(date) ?? null
    const isDayOff = isWeekend || holidayName !== null
    return { date, kind: isDayOff ? 'day_off' : 'workday', holidayName }
  })
}

/** Hours `[fromHour, toHour)` of a shift, counted from its start, split by calendar month. */
export function segmentHoursByMonth(
  date: IsoDate,
  kind: DayKind,
  fromHour: number,
  toHour: number,
): Map<MonthId, number> {
  const startHour = SHIFT_START_HOUR[kind]
  const hoursLeftOnStartDay = HOURS_PER_DAY - startHour
  const hoursOnStartDay = Math.max(0, Math.min(toHour, hoursLeftOnStartDay) - fromHour)
  const hoursOnNextDay = toHour - fromHour - hoursOnStartDay

  const hoursByMonth = new Map<MonthId, number>()
  const addHours = (month: MonthId, hours: number) => {
    if (hours > 0) hoursByMonth.set(month, (hoursByMonth.get(month) ?? 0) + hours)
  }
  addHours(monthOf(date), hoursOnStartDay)
  addHours(monthOf(addDays(date, 1)), hoursOnNextDay)
  return hoursByMonth
}

export type Segment<DevId> = { devId: DevId; fromHour: number; toHour: number }
export type ShiftDay<DevId> = { date: IsoDate; kind: DayKind; segments: Segment<DevId>[] }

/**
 * Hours each dev covers inside `month`, by calendar hour (decisions #15). Pass the month's days
 * **and** the last day of the previous month: its shift runs into day 1.
 */
export function monthlyHoursByDev<DevId>(month: MonthId, days: ShiftDay<DevId>[]): Map<DevId, number> {
  const hoursByDev = new Map<DevId, number>()
  for (const day of days) {
    for (const segment of day.segments) {
      const hoursInMonth =
        segmentHoursByMonth(day.date, day.kind, segment.fromHour, segment.toHour).get(month) ?? 0
      if (hoursInMonth > 0) hoursByDev.set(segment.devId, (hoursByDev.get(segment.devId) ?? 0) + hoursInMonth)
    }
  }
  return hoursByDev
}

/** Total on-call hours that fall inside `month`, given the day kinds of the month and the day before. */
export function monthTotalHours(
  month: MonthId,
  days: ReadonlyArray<{ date: IsoDate; kind: DayKind }>,
): number {
  let total = 0
  for (const day of days) {
    total += segmentHoursByMonth(day.date, day.kind, 0, shiftLength(day.kind)).get(month) ?? 0
  }
  return total
}

export type SegmentProblem = 'out_of_range' | 'gap' | 'overlap'

/**
 * Segments of one shift must be empty (unassigned day) or cover it whole, with no gap or overlap.
 * The database cannot express this; every write path checks it here.
 */
export function findSegmentProblem<DevId>(kind: DayKind, segments: Segment<DevId>[]): SegmentProblem | null {
  const isUnassigned = segments.length === 0
  if (isUnassigned) return null

  const length = shiftLength(kind)
  const ordered = [...segments].sort((first, second) => first.fromHour - second.fromHour)
  const isOutOfRange = ordered.some(
    (segment) => segment.fromHour < 0 || segment.toHour > length || segment.fromHour >= segment.toHour,
  )
  if (isOutOfRange) return 'out_of_range'

  let coveredUntil = 0
  for (const segment of ordered) {
    if (segment.fromHour > coveredUntil) return 'gap'
    if (segment.fromHour < coveredUntil) return 'overlap'
    coveredUntil = segment.toHour
  }
  const endsBeforeShiftEnd = coveredUntil < length
  return endsBeforeShiftEnd ? 'gap' : null
}
