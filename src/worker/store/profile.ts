import { asc, eq } from 'drizzle-orm'
import type { IsoDate } from '../../schedule/dates'
import { absencesWithDays, type PreferenceRule } from '../../schedule/preferences'
import type { Database } from '../db/client'
import { absences, devs, months, preferenceRules } from '../db/schema'
import { ApiError } from '../errors'
import { insertRows, runBatch } from './batch'

// The dev's own profile (decisions #5): weekday rules and the days they can't take. Changing it never
// touches an open month; it applies to the next suggestion.

export async function loadProfile(database: Database, devId: number) {
  const [dev, rules, absenceRows, monthRows] = await Promise.all([
    database.query.devs.findFirst({ where: eq(devs.id, devId) }),
    database
      .select({
        kind: preferenceRules.kind,
        value: preferenceRules.value,
        preference: preferenceRules.preference,
      })
      .from(preferenceRules)
      .where(eq(preferenceRules.devId, devId))
      .orderBy(asc(preferenceRules.kind), asc(preferenceRules.value)),
    database
      .select({ fromDate: absences.fromDate, toDate: absences.toDate })
      .from(absences)
      .where(eq(absences.devId, devId))
      .orderBy(asc(absences.fromDate)),
    database.select({ id: months.id }).from(months).orderBy(asc(months.id)),
  ])
  if (!dev) throw new ApiError(404, 'dev_not_found')
  return {
    dev: { id: dev.id, nickname: dev.nickname, weight: dev.weight },
    rules,
    absences: absenceRows,
    /** Months that already have a roster: changing the profile no longer touches them (#5). */
    rosterMonths: monthRows.map((month) => month.id),
  }
}

/** Replaces every rule of the dev. One rule per (kind, value). */
export async function replaceRules(
  database: Database,
  devId: number,
  rules: PreferenceRule[],
): Promise<void> {
  const keys = rules.map((rule) => `${rule.kind}:${rule.value}`)
  const hasRepeatedDay = new Set(keys).size !== keys.length
  if (hasRepeatedDay) throw new ApiError(422, 'repeated_rule')

  await runBatch(database, [
    database.delete(preferenceRules).where(eq(preferenceRules.devId, devId)),
    ...insertRows(
      database,
      preferenceRules,
      rules.map((rule) => ({ devId, ...rule })),
    ),
  ])
}

/**
 * Marks or clears every day of a range and returns the dev's absences after it. The dev's periods
 * are rewritten as a whole, so they stay merged: never two on the same day, nor two that touch.
 */
export async function setAbsenceDays(
  database: Database,
  devId: number,
  change: { fromDate: IsoDate; toDate: IsoDate; absent: boolean },
) {
  const existing = await database
    .select({ fromDate: absences.fromDate, toDate: absences.toDate })
    .from(absences)
    .where(eq(absences.devId, devId))
  const periods = absencesWithDays(existing, change, change.absent)
  await runBatch(database, [
    database.delete(absences).where(eq(absences.devId, devId)),
    ...insertRows(
      database,
      absences,
      periods.map((period) => ({ devId, ...period })),
    ),
  ])
  return periods
}
