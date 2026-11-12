import type { IsoDate, MonthId } from './dates'
import { type Absence, type Preference, type PreferenceRule, preferenceOn } from './preferences'
import { type DayKind, type ShiftDay, segmentHoursByMonth, shiftLength } from './shifts'

// Suggests a month's roster (decisions #6). `cant` is the only hard rule; the rest are goals that
// enter one cost, and the suggestion is the roster with the lowest cost the search finds:
//
//   1. hour balance, in proportion to participation weight (#18), carrying previous months;
//   2. weekend/holiday shifts spread across devs;
//   3. `good` days taken, `avoid` days left alone;
//   4. no back-to-back shifts for the same dev.
//
// The goal order comes from the size of each cost (see COST below), not from strict priority:
// a goal lower in the list can only win when the hours of the goals above barely change.
//
// Deterministic: the same input always gives the same roster (ties go to the earlier dev in `devs`).

export type SchedulerDev<DevId> = {
  id: DevId
  /** Participation weight in percent (#18). A dev with weight 0 is never scheduled. */
  weight: number
  /** Hours above (+) or below (−) the expected share, carried from previous months (#18, #19). */
  balance: number
  rules: ReadonlyArray<PreferenceRule>
  absences: ReadonlyArray<Absence>
}

export type SuggestInput<DevId> = {
  month: MonthId
  /** Every day of the month with its kind, in date order. */
  calendar: ReadonlyArray<{ date: IsoDate; kind: DayKind }>
  /** The previous month's last day as assigned: its shift runs into day 1. `null` when unknown. */
  previousDay: ShiftDay<DevId> | null
  devs: ReadonlyArray<SchedulerDev<DevId>>
}

export type Suggestion<DevId> = {
  days: ShiftDay<DevId>[]
  /** Days nobody can take (#22). They stay without segments. */
  unassignedDates: IsoDate[]
}

/**
 * Cost of each goal. Balance costs the squared hours away from the share, so moving a 15h shift
 * between two devs at their share costs 2 × 15² = 450: every other cost here is smaller, and a
 * single preference never undoes a balanced split.
 */
const COST = {
  /** Per squared weekend/holiday shift away from the dev's share of them. */
  dayOffSpread: 150,
  avoid: 100,
  good: -30,
  backToBack: 40,
} as const

const MAX_IMPROVEMENT_ROUNDS = 200

type Day = {
  date: IsoDate
  kind: DayKind
  /** Shift hours that fall inside the month (the last shift runs into the next one). */
  hoursInMonth: number
  /** Index into `devs` → preference on this date. */
  preferences: (Preference | null)[]
  /** Indexes into `devs` of who can take the day. */
  candidates: number[]
}

/** `assignment[dayIndex]` = index into `devs`, or `null` while unassigned. */
type Assignment = (number | null)[]

export function suggestRoster<DevId>(input: SuggestInput<DevId>): Suggestion<DevId> {
  const { month, devs } = input
  const days = input.calendar.map((calendarDay): Day => {
    const preferences = devs.map((dev) => preferenceOn(calendarDay.date, dev.rules, dev.absences))
    const candidates = devs.flatMap((dev, index) =>
      dev.weight > 0 && preferences[index] !== 'cant' ? [index] : [],
    )
    const hoursInMonth =
      segmentHoursByMonth(calendarDay.date, calendarDay.kind, 0, shiftLength(calendarDay.kind)).get(month) ??
      0
    return { ...calendarDay, hoursInMonth, preferences, candidates }
  })

  const cost = rosterCost(input, days)
  const assignment = assignGreedily(days, cost)
  improve(assignment, days, cost)

  return {
    days: days.map((day, index) => {
      const devIndex = assignment[index] ?? null
      const dev = devIndex === null ? undefined : devs[devIndex]
      const segments = dev ? [{ devId: dev.id, fromHour: 0, toHour: shiftLength(day.kind) }] : []
      return { date: day.date, kind: day.kind, segments }
    }),
    unassignedDates: days.filter((day) => day.candidates.length === 0).map((day) => day.date),
  }
}

/** Builds the cost function of a (possibly partial) assignment. Lower is better. */
function rosterCost<DevId>(input: SuggestInput<DevId>, days: Day[]): (assignment: Assignment) => number {
  const { devs, previousDay, month } = input
  const schedulableWeight = devs.reduce((sum, dev) => sum + dev.weight, 0)
  const shareOf = (dev: SchedulerDev<DevId>) => (dev.weight > 0 ? dev.weight / schedulableWeight : 0)

  const hoursFromPreviousDay = devs.map((dev) =>
    previousDay ? hoursInMonthOf(previousDay, dev.id, month) : 0,
  )
  const monthHours =
    hoursFromPreviousDay.reduce((sum, hours) => sum + hours, 0) +
    days.reduce((sum, day) => sum + day.hoursInMonth, 0)
  const expectedHours = devs.map((dev) => shareOf(dev) * monthHours)
  const dayOffCount = days.filter((day) => day.kind === 'day_off').length
  const expectedDaysOff = devs.map((dev) => shareOf(dev) * dayOffCount)
  const previousDayDevIndex = devs.findIndex((dev) => dev.id === previousDay?.segments.at(-1)?.devId)

  return (assignment) => {
    const hours = [...hoursFromPreviousDay]
    const daysOff = devs.map(() => 0)
    let goalsCost = 0
    let previousDevIndex: number | null = previousDayDevIndex >= 0 ? previousDayDevIndex : null

    days.forEach((day, dayIndex) => {
      const devIndex = assignment[dayIndex] ?? null
      if (devIndex === null) {
        previousDevIndex = null
        return
      }
      hours[devIndex] = (hours[devIndex] ?? 0) + day.hoursInMonth
      if (day.kind === 'day_off') daysOff[devIndex] = (daysOff[devIndex] ?? 0) + 1
      const preference = day.preferences[devIndex]
      if (preference === 'avoid') goalsCost += COST.avoid
      if (preference === 'good') goalsCost += COST.good
      if (devIndex === previousDevIndex) goalsCost += COST.backToBack
      previousDevIndex = devIndex
    })

    const balanceCost = devs.reduce((sum, dev, index) => {
      const finalBalance = dev.balance + (hours[index] ?? 0) - (expectedHours[index] ?? 0)
      return sum + finalBalance ** 2
    }, 0)
    const dayOffSpreadCost = devs.reduce((sum, _dev, index) => {
      const distance = (daysOff[index] ?? 0) - (expectedDaysOff[index] ?? 0)
      return sum + COST.dayOffSpread * distance ** 2
    }, 0)
    return balanceCost + dayOffSpreadCost + goalsCost
  }
}

/** Hours of `devId` in a day's segments that fall inside `month`. */
function hoursInMonthOf<DevId>(day: ShiftDay<DevId>, devId: DevId, month: MonthId): number {
  return day.segments
    .filter((segment) => segment.devId === devId)
    .reduce(
      (sum, segment) =>
        sum + (segmentHoursByMonth(day.date, day.kind, segment.fromHour, segment.toHour).get(month) ?? 0),
      0,
    )
}

/** First pass: the most constrained days first (fewest candidates, 24h days), each to the cheapest dev. */
function assignGreedily(days: Day[], cost: (assignment: Assignment) => number): Assignment {
  const assignment: Assignment = days.map(() => null)
  const order = days
    .map((day, index) => ({ day, index }))
    .sort(
      (first, second) =>
        first.day.candidates.length - second.day.candidates.length ||
        shiftLength(second.day.kind) - shiftLength(first.day.kind) ||
        first.index - second.index,
    )
  for (const { day, index } of order) {
    assignment[index] = cheapestCandidate(day.candidates, (devIndex) => {
      assignment[index] = devIndex
      return cost(assignment)
    })
  }
  return assignment
}

function cheapestCandidate(candidates: number[], costWith: (devIndex: number) => number): number | null {
  let best: { devIndex: number; cost: number } | null = null
  for (const devIndex of candidates) {
    const candidateCost = costWith(devIndex)
    const isCheaper = best === null || candidateCost < best.cost
    if (isCheaper) best = { devIndex, cost: candidateCost }
  }
  return best?.devIndex ?? null
}

/**
 * Local search: give a day to another dev, or swap the devs of two days, whenever that lowers the
 * cost; repeat until nothing does. Swaps fix what single moves cannot (a swap keeps both devs'
 * hours when the days have the same kind).
 */
function improve(assignment: Assignment, days: Day[], cost: (assignment: Assignment) => number): void {
  let currentCost = cost(assignment)
  const tryChange = (apply: () => void, undo: () => void) => {
    apply()
    const newCost = cost(assignment)
    const isBetter = newCost < currentCost - 1e-9
    if (isBetter) currentCost = newCost
    else undo()
    return isBetter
  }

  for (let round = 0; round < MAX_IMPROVEMENT_ROUNDS; round++) {
    let hasImproved = false

    days.forEach((day, dayIndex) => {
      for (const devIndex of day.candidates) {
        const previousDev = assignment[dayIndex] ?? null
        if (devIndex === previousDev) continue
        hasImproved =
          tryChange(
            () => {
              assignment[dayIndex] = devIndex
            },
            () => {
              assignment[dayIndex] = previousDev
            },
          ) || hasImproved
      }
    })

    days.forEach((firstDay, firstIndex) => {
      for (let secondIndex = firstIndex + 1; secondIndex < days.length; secondIndex++) {
        const firstDev = assignment[firstIndex] ?? null
        const secondDev = assignment[secondIndex] ?? null
        const secondDay = days[secondIndex]
        const canSwap =
          firstDev !== null &&
          secondDev !== null &&
          firstDev !== secondDev &&
          firstDay.candidates.includes(secondDev) &&
          (secondDay?.candidates.includes(firstDev) ?? false)
        if (!canSwap) continue
        const swap = (firstValue: number, secondValue: number) => () => {
          assignment[firstIndex] = firstValue
          assignment[secondIndex] = secondValue
        }
        hasImproved = tryChange(swap(secondDev, firstDev), swap(firstDev, secondDev)) || hasImproved
      }
    })

    if (!hasImproved) return
  }
}
