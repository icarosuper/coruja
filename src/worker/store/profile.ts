import { and, asc, eq } from 'drizzle-orm'
import type { IsoDate } from '../../schedule/dates'
import type { PreferenceRule } from '../../schedule/preferences'
import type { Database } from '../db/client'
import { absences, devs, preferenceRules } from '../db/schema'
import { ApiError } from '../errors'
import { insertRows, runBatch } from './batch'

// The dev's own profile (decisions #5): recurring rules and planned absences. Changing it never
// touches an open month; it applies to the next suggestion.

export async function loadProfile(database: Database, devId: number) {
  const [dev, rules, absenceRows] = await Promise.all([
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
      .select({ id: absences.id, fromDate: absences.fromDate, toDate: absences.toDate, note: absences.note })
      .from(absences)
      .where(eq(absences.devId, devId))
      .orderBy(asc(absences.fromDate)),
  ])
  if (!dev) throw new ApiError(404, 'dev_not_found')
  return {
    dev: { id: dev.id, nickname: dev.nickname, weight: dev.weight },
    rules,
    absences: absenceRows,
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

export async function addAbsence(
  database: Database,
  devId: number,
  absence: { fromDate: IsoDate; toDate: IsoDate; note: string | null },
) {
  const isBackwards = absence.fromDate > absence.toDate
  if (isBackwards) throw new ApiError(422, 'absence_ends_before_it_starts')
  const [created] = await database
    .insert(absences)
    .values({ devId, ...absence })
    .returning({ id: absences.id, fromDate: absences.fromDate, toDate: absences.toDate, note: absences.note })
  if (!created) throw new Error('Insert returned no absence')
  return created
}

export async function removeAbsence(database: Database, devId: number, absenceId: number): Promise<void> {
  const deleted = await database
    .delete(absences)
    .where(and(eq(absences.id, absenceId), eq(absences.devId, devId)))
    .returning({ id: absences.id })
  const wasOwnAbsence = deleted.length > 0
  if (!wasOwnAbsence) throw new ApiError(404, 'absence_not_found')
}
