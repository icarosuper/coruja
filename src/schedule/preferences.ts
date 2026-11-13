import { addDays, type IsoDate, weekdayOf } from './dates'

// Profile rules and planned absences (decisions #5), resolved to one preference per dev and date.

export const PREFERENCE_RULE_KINDS = ['weekday', 'month_day'] as const
export type PreferenceRuleKind = (typeof PREFERENCE_RULE_KINDS)[number]

export const PREFERENCES = ['good', 'avoid', 'cant'] as const
export type Preference = (typeof PREFERENCES)[number]

/** `value` is 0–6 (Sunday = 0) for `weekday`, 1–31 for `month_day`. */
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
  const dayOfMonth = Number(date.slice(8, 10))
  const matchingPreferences = rules
    .filter(
      (rule) =>
        (rule.kind === 'weekday' && rule.value === weekday) ||
        (rule.kind === 'month_day' && rule.value === dayOfMonth),
    )
    .map((rule) => rule.preference)

  let strongest: Preference | null = null
  for (const preference of matchingPreferences) {
    const isMoreRestrictive = strongest === null || RESTRICTIVENESS[preference] > RESTRICTIVENESS[strongest]
    if (isMoreRestrictive) strongest = preference
  }
  return strongest
}

// YYYY-MM-DD strings compare in date order (Math.min/max would turn them into NaN).
const earlierDate = (first: IsoDate, second: IsoDate) => (first < second ? first : second)
const laterDate = (first: IsoDate, second: IsoDate) => (first > second ? first : second)

/**
 * The absences that `added` overlaps or touches (the day before it starts, the day after it ends),
 * and the single range covering all of them. A dev never ends up with two absences on the same day.
 */
export function absencesMergedWith<Existing extends Absence>(
  existing: ReadonlyArray<Existing>,
  added: Absence,
): { merged: Absence; absorbed: Existing[] } {
  const absorbed = existing.filter(
    (absence) =>
      absence.fromDate <= addDays(added.toDate, 1) && absence.toDate >= addDays(added.fromDate, -1),
  )
  const merged = absorbed.reduce(
    (range, absence) => ({
      fromDate: earlierDate(absence.fromDate, range.fromDate),
      toDate: laterDate(absence.toDate, range.toDate),
    }),
    { fromDate: added.fromDate, toDate: added.toDate },
  )
  return { merged, absorbed }
}
