import { addDays, type IsoDate, weekdayOf } from './dates'

// Profile rules and planned absences (decisions #5), resolved to one preference per dev and date.

export const PREFERENCE_RULE_KINDS = ['weekday'] as const
export type PreferenceRuleKind = (typeof PREFERENCE_RULE_KINDS)[number]

export const PREFERENCES = ['good', 'avoid', 'cant'] as const
export type Preference = (typeof PREFERENCES)[number]

/** `value` is 0–6 (Sunday = 0) for `weekday`. */
export type PreferenceRule = { kind: PreferenceRuleKind; value: number; preference: Preference }

/** Inclusive date range. */
export type Absence = { fromDate: IsoDate; toDate: IsoDate }

/** When two rules match the same date, the more restrictive one wins: cant > avoid > good. */
const RESTRICTIVENESS: Record<Preference, number> = { good: 1, avoid: 2, cant: 3 }

/** The dev's preference for a date, or `null` when nothing in the profile mentions it (neutral). */
export function preferenceOn(
  date: IsoDate,
  rules: ReadonlyArray<PreferenceRule>,
  absences: ReadonlyArray<Absence>,
): Preference | null {
  const isAbsent = absences.some((absence) => absence.fromDate <= date && date <= absence.toDate)
  if (isAbsent) return 'cant'

  const weekday = weekdayOf(date)
  const matchingPreferences = rules
    .filter((rule) => rule.kind === 'weekday' && rule.value === weekday)
    .map((rule) => rule.preference)

  let strongest: Preference | null = null
  for (const preference of matchingPreferences) {
    const isMoreRestrictive = strongest === null || RESTRICTIVENESS[preference] > RESTRICTIVENESS[strongest]
    if (isMoreRestrictive) strongest = preference
  }
  return strongest
}

/** Longest absence period accepted in one change: a year, so a slip of the year is refused. */
export const MAX_ABSENCE_DAYS = 366

/**
 * The dev's absences after marking (`isAbsent`) or clearing every day of `range`, as sorted,
 * non-overlapping, non-touching periods: a dev never has two absences on the same day, and
 * clearing a day in the middle of a period splits it in two.
 */
export function absencesWithDays(
  existing: ReadonlyArray<Absence>,
  range: Absence,
  isAbsent: boolean,
): Absence[] {
  const days = new Set<IsoDate>()
  const eachDay = (absence: Absence, visit: (date: IsoDate) => void) => {
    for (let date = absence.fromDate; date <= absence.toDate; date = addDays(date, 1)) visit(date)
  }
  for (const absence of existing) eachDay(absence, (date) => days.add(date))
  eachDay(range, (date) => (isAbsent ? days.add(date) : days.delete(date)))

  const periods: Absence[] = []
  for (const date of [...days].sort()) {
    const last = periods.at(-1)
    const continuesLast = last !== undefined && addDays(last.toDate, 1) === date
    if (continuesLast) last.toDate = date
    else periods.push({ fromDate: date, toDate: date })
  }
  return periods
}
