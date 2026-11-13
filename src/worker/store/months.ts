import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { monthHoursByDev } from '../../schedule/balance'
import { addDays, daysOfMonth, type IsoDate, type MonthId, monthOf, nextMonth } from '../../schedule/dates'
import { suggestRoster } from '../../schedule/scheduler'
import { type DayKind, defaultCalendar, findSegmentProblem, type Segment } from '../../schedule/shifts'
import { bankingCells, officeScript, pasteGrid } from '../../sheet/export'
import type { Database } from '../db/client'
import {
  absences,
  changeLog,
  confirmations,
  days,
  devs,
  monthParticipants,
  months,
  preferenceRules,
  shiftSegments,
} from '../db/schema'
import { ApiError } from '../errors'
import { loadBalances } from './balances'
import { insertRows, runBatch } from './batch'
import { loadShiftDays, loadShiftDaysOn } from './shift-days'

// The month lifecycle (architecture.md, "Month lifecycle"; decisions #7, #20, #21, #22).

/** Log actions that change days; counted as "changes after the export". */
const DAY_CHANGE_ACTIONS = ['assign', 'split', 'day_kind', 'sync'] as const
export const EXPORT_FORMATS = ['office_script', 'paste_grid'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export type DayChange = { date: IsoDate; kind: DayKind; segments: Segment<number>[] }
type LoggedDay = { kind: DayKind; segments: Segment<number>[] }

export async function listMonths(database: Database) {
  const rows = await database
    .select({ id: months.id, exportedAt: months.exportedAt })
    .from(months)
    .orderBy(desc(months.id))
  return rows.map((row) => ({ id: row.id, exportedAt: row.exportedAt?.getTime() ?? null }))
}

async function findMonth(database: Database, monthId: MonthId) {
  const month = await database.query.months.findFirst({ where: eq(months.id, monthId) })
  if (!month) throw new ApiError(404, 'month_not_found')
  return month
}

/** Fails unless `monthId` would be the latest month: months are added in order, never before another. */
export async function ensureMonthCanBeAdded(database: Database, monthId: MonthId): Promise<void> {
  const existing = await database.select({ id: months.id }).from(months)
  const alreadyExists = existing.some((month) => month.id === monthId)
  if (alreadyExists) throw new ApiError(409, 'month_exists')
  const hasLaterMonth = existing.some((month) => month.id > monthId)
  if (hasLaterMonth) throw new ApiError(409, 'later_month_exists')
}

/**
 * Opens a month with a suggested roster (decisions #7): every active dev with a weight above 0
 * takes part, with the weight frozen now; holidays come from the São Paulo calendar (#14).
 * `actorDevId` is null when the cron opens it.
 */
export async function openMonth(database: Database, monthId: MonthId, actorDevId: number | null) {
  await ensureMonthCanBeAdded(database, monthId)
  const dates = daysOfMonth(monthId)
  const firstDate = dates[0] ?? ''
  const lastDate = dates.at(-1) ?? ''
  const previousDate = addDays(firstDate, -1)

  const activeDevs = await database
    .select({ id: devs.id, weight: devs.weight })
    .from(devs)
    .where(eq(devs.active, true))
    .orderBy(asc(devs.id))
  const participants = activeDevs.filter((dev) => dev.weight > 0)
  const participantIds = participants.map((dev) => dev.id)

  const [balancesAt, ruleRows, absenceRows, previousDays] = await Promise.all([
    loadBalances(database),
    participantIds.length === 0
      ? []
      : database.select().from(preferenceRules).where(inArray(preferenceRules.devId, participantIds)),
    participantIds.length === 0
      ? []
      : database
          .select()
          .from(absences)
          .where(
            and(
              inArray(absences.devId, participantIds),
              lte(absences.fromDate, lastDate),
              gte(absences.toDate, firstDate),
            ),
          ),
    loadShiftDaysOn(database, [previousDate]),
  ])
  const balances = balancesAt(monthId)
  const calendar = defaultCalendar(monthId)
  const suggestion = suggestRoster({
    month: monthId,
    calendar,
    previousDay: previousDays.get(previousDate) ?? null,
    devs: participants.map((dev) => ({
      id: dev.id,
      weight: dev.weight,
      balance: balances.get(dev.id) ?? 0,
      rules: ruleRows.filter((rule) => rule.devId === dev.id),
      absences: absenceRows.filter((absence) => absence.devId === dev.id),
    })),
  })

  const now = new Date()
  await runBatch(database, [
    database.insert(months).values({ id: monthId, openedAt: now }),
    ...insertRows(
      database,
      monthParticipants,
      participants.map((dev) => ({ monthId, devId: dev.id, weight: dev.weight })),
    ),
    ...insertRows(
      database,
      days,
      calendar.map((day) => ({ ...day, monthId })),
    ),
    ...insertRows(
      database,
      shiftSegments,
      suggestion.days.flatMap((day) => day.segments.map((segment) => ({ date: day.date, ...segment }))),
    ),
    database.insert(changeLog).values({
      monthId,
      actorDevId,
      action: 'generate',
      after: { unassignedDates: suggestion.unassignedDates },
      createdAt: now,
    }),
  ])
}

/** Everything the month's calendar shows: days, participants with hours and balances, readiness. */
export async function monthView(database: Database, monthId: MonthId) {
  const month = await findMonth(database, monthId)
  const dates = daysOfMonth(monthId)
  const previousDate = addDays(dates[0] ?? '', -1)

  const [shiftDays, participantRows, confirmationRows, devRows, balancesAt, changesAfterExport] =
    await Promise.all([
      loadShiftDays(database, { fromDate: previousDate, toDate: dates.at(-1) ?? '' }),
      database.select().from(monthParticipants).where(eq(monthParticipants.monthId, monthId)),
      database.select().from(confirmations).where(eq(confirmations.monthId, monthId)),
      database.select({ id: devs.id, nickname: devs.nickname }).from(devs),
      loadBalances(database),
      countChangesAfter(database, monthId, month.exportedAt),
    ])
  const nicknameOf = (devId: number) => devRows.find((dev) => dev.id === devId)?.nickname ?? '?'
  const withNicknames = (segments: Segment<number>[]) =>
    segments.map((segment) => ({ ...segment, nickname: nicknameOf(segment.devId) }))

  const monthDays = shiftDays.filter((day) => monthOf(day.date) === monthId)
  const previousDay = shiftDays.find((day) => day.date === previousDate) ?? null
  const hoursByDev = monthHoursByDev(monthId, shiftDays, participantRows)
  const balancesBeforeMonth = balancesAt(monthId)
  const balancesAfterMonth = balancesAt(nextMonth(monthId))
  const confirmedDevIds = new Set(confirmationRows.map((confirmation) => confirmation.devId))

  const participants = participantRows
    .map((participant) => ({
      devId: participant.devId,
      nickname: nicknameOf(participant.devId),
      weight: participant.weight,
      hours: hoursByDev.get(participant.devId)?.hours ?? 0,
      expectedHours: hoursByDev.get(participant.devId)?.expectedHours ?? 0,
      balanceBefore: balancesBeforeMonth.get(participant.devId) ?? 0,
      balanceAfter: balancesAfterMonth.get(participant.devId) ?? 0,
      confirmed: confirmedDevIds.has(participant.devId),
    }))
    .sort((first, second) => first.nickname.localeCompare(second.nickname, 'pt-BR'))
  const participantIds = new Set(participantRows.map((participant) => participant.devId))
  /** Devs with hours in the month who were not participants (assigned by an edit, decisions #25). */
  const outsiders = [...hoursByDev.keys()]
    .filter((devId) => !participantIds.has(devId))
    .map((devId) => ({
      devId,
      nickname: nicknameOf(devId),
      hours: hoursByDev.get(devId)?.hours ?? 0,
      balanceBefore: balancesBeforeMonth.get(devId) ?? 0,
      balanceAfter: balancesAfterMonth.get(devId) ?? 0,
    }))
  const unassignedDates = monthDays.filter((day) => day.segments.length === 0).map((day) => day.date)
  const pendingDevIds = participants.filter((participant) => !participant.confirmed).map((p) => p.devId)
  const isReady = unassignedDates.length === 0 && pendingDevIds.length === 0

  return {
    id: month.id,
    openedAt: month.openedAt.getTime(),
    /** Null until someone exports; `byNickname` is null for a month imported from the sheet. */
    exported: month.exportedAt && {
      at: month.exportedAt.getTime(),
      byNickname: month.exportedByDevId === null ? null : nicknameOf(month.exportedByDevId),
      changesAfter: changesAfterExport,
    },
    days: monthDays.map((day) => ({
      date: day.date,
      kind: day.kind,
      holidayName: day.holidayName,
      segments: withNicknames(day.segments),
    })),
    previousDay: previousDay && {
      date: previousDay.date,
      kind: previousDay.kind,
      segments: withNicknames(previousDay.segments),
    },
    participants,
    outsiders,
    unassignedDates,
    pendingDevIds,
    isReady,
  }
}

/**
 * Applies new kinds and segments to days of the month, atomically. An `edit` comes from the
 * calendar, a `sync` from the sheet (decisions #23). Any dev can be assigned, not only the month's
 * participants: an outsider's hours count against an expected share of zero (decisions #25). Before
 * the export, every dev whose hours changed has to confirm again (#7); after it, the change is only
 * recorded and counts as a change the sheet does not have yet (#20). Each changed day
 * is logged (#21); days that end up as they were are skipped.
 */
export async function applyDayChanges(
  database: Database,
  monthId: MonthId,
  changes: DayChange[],
  actorDevId: number | null,
  source: 'edit' | 'sync',
) {
  const month = await findMonth(database, monthId)
  const monthDates = new Set(daysOfMonth(monthId))
  const dates = changes.map((change) => change.date)
  const hasRepeatedDate = new Set(dates).size !== dates.length
  if (hasRepeatedDate) throw new ApiError(422, 'repeated_date')

  const devRows = await database.select({ id: devs.id }).from(devs)
  const devIds = new Set(devRows.map((dev) => dev.id))
  for (const change of changes) {
    const isInMonth = monthDates.has(change.date)
    if (!isInMonth) throw new ApiError(422, 'date_outside_month', { date: change.date })
    const problem = findSegmentProblem(change.kind, change.segments)
    if (problem) throw new ApiError(422, 'invalid_segments', { date: change.date, problem })
    const unknownDev = change.segments.find((segment) => !devIds.has(segment.devId))
    if (unknownDev) throw new ApiError(422, 'unknown_dev', { date: change.date, devId: unknownDev.devId })
  }

  const currentDays = await loadShiftDaysOn(database, dates)
  const statements: BatchItem<'sqlite'>[] = []
  const devsToReconfirm = new Set<number>()
  const changedDates: IsoDate[] = []
  const now = new Date()

  for (const change of changes) {
    const current = currentDays.get(change.date)
    if (!current) throw new Error(`Day ${change.date} of an existing month is missing`)
    const before: LoggedDay = { kind: current.kind, segments: current.segments }
    const after: LoggedDay = { kind: change.kind, segments: sortedSegments(change.segments) }
    const changedDevs = devsWithChangedHours(before, after)
    const isKindChanged = before.kind !== after.kind
    const isUnchanged = !isKindChanged && changedDevs.size === 0
    if (isUnchanged) continue

    changedDates.push(change.date)
    for (const devId of changedDevs) devsToReconfirm.add(devId)
    statements.push(
      database.update(days).set({ kind: after.kind }).where(eq(days.date, change.date)),
      database.delete(shiftSegments).where(eq(shiftSegments.date, change.date)),
      ...insertRows(
        database,
        shiftSegments,
        after.segments.map((segment) => ({ date: change.date, ...segment })),
      ),
      database.insert(changeLog).values({
        monthId,
        date: change.date,
        actorDevId,
        action: logActionOf(source, before, after),
        before,
        after,
        createdAt: now,
      }),
    )
  }

  const isExported = month.exportedAt !== null
  const resetsConfirmations = !isExported && devsToReconfirm.size > 0
  if (resetsConfirmations) {
    statements.push(
      database
        .delete(confirmations)
        .where(and(eq(confirmations.monthId, monthId), inArray(confirmations.devId, [...devsToReconfirm]))),
    )
  }
  await runBatch(database, statements)
  return { changedDates, devsToReconfirm: isExported ? [] : [...devsToReconfirm].sort((a, b) => a - b) }
}

export function sortedSegments(segments: Segment<number>[]): Segment<number>[] {
  return [...segments]
    .sort((first, second) => first.fromHour - second.fromHour)
    .map(({ devId, fromHour, toHour }) => ({ devId, fromHour, toHour }))
}

/** Devs whose hours on the day differ. A new day kind changes everyone's hours on that day. */
function devsWithChangedHours(before: LoggedDay, after: LoggedDay): Set<number> {
  const everyone = new Set([...before.segments, ...after.segments].map((segment) => segment.devId))
  const isKindChanged = before.kind !== after.kind
  if (isKindChanged) return everyone

  const rangesOf = (day: LoggedDay, devId: number) =>
    day.segments
      .filter((segment) => segment.devId === devId)
      .map((segment) => `${segment.fromHour}-${segment.toHour}`)
      .join(',')
  return new Set([...everyone].filter((devId) => rangesOf(before, devId) !== rangesOf(after, devId)))
}

function logActionOf(source: 'edit' | 'sync', before: LoggedDay, after: LoggedDay) {
  if (source === 'sync') return 'sync'
  if (before.kind !== after.kind) return 'day_kind'
  const isSplit = after.segments.length > 1
  return isSplit ? 'split' : 'assign'
}

/** The calling dev confirms the month's roster (every participant does, #7), until it is exported. */
export async function confirmMonth(database: Database, monthId: MonthId, devId: number): Promise<void> {
  const month = await findMonth(database, monthId)
  const isExported = month.exportedAt !== null
  if (isExported) throw new ApiError(409, 'month_exported')
  const participant = await database.query.monthParticipants.findFirst({
    where: and(eq(monthParticipants.monthId, monthId), eq(monthParticipants.devId, devId)),
  })
  if (!participant) throw new ApiError(403, 'not_participant')

  const inserted = await database
    .insert(confirmations)
    .values({ monthId, devId })
    .onConflictDoNothing()
    .returning({ devId: confirmations.devId })
  const isNewConfirmation = inserted.length > 0
  if (isNewConfirmation) {
    await database.insert(changeLog).values({ monthId, actorDevId: devId, action: 'confirm' })
  }
}

/**
 * Records an export to the manager's sheet and returns it: the Office Script or the grid to paste
 * (decisions #4). Pending confirmations are allowed, the web app warns first (#7); empty days are
 * not (#22). Exporting again is how changes made after an export reach the sheet.
 */
export async function exportMonth(database: Database, monthId: MonthId, devId: number, format: ExportFormat) {
  await findMonth(database, monthId)
  const dates = daysOfMonth(monthId)
  const previousDate = addDays(dates[0] ?? '', -1)
  const [shiftDays, devRows] = await Promise.all([
    loadShiftDays(database, { fromDate: previousDate, toDate: dates.at(-1) ?? '' }),
    database.select({ id: devs.id, nickname: devs.nickname }).from(devs),
  ])
  const monthDays = shiftDays.filter((day) => monthOf(day.date) === monthId)
  const unassignedDates = monthDays.filter((day) => day.segments.length === 0).map((day) => day.date)
  const hasUnassignedDays = unassignedDates.length > 0
  if (hasUnassignedDays) throw new ApiError(409, 'unassigned_days', { dates: unassignedDates })

  const nicknameOf = (devId: number) => devRows.find((dev) => dev.id === devId)?.nickname ?? '?'
  const byNickname = shiftDays.map((day) => ({
    ...day,
    segments: day.segments.map((segment) => ({ ...segment, devId: nicknameOf(segment.devId) })),
  }))
  const cells = bankingCells(monthId, byNickname)

  const now = new Date()
  await runBatch(database, [
    database.update(months).set({ exportedAt: now, exportedByDevId: devId }).where(eq(months.id, monthId)),
    database
      .insert(changeLog)
      .values({ monthId, actorDevId: devId, action: 'export', after: { format }, createdAt: now }),
  ])
  return format === 'office_script'
    ? { format, script: officeScript(monthId, cells), grid: null }
    : { format, script: null, grid: pasteGrid(cells) }
}

/** Day changes logged after `exportedAt`: what the sheet does not have yet. */
async function countChangesAfter(database: Database, monthId: MonthId, exportedAt: Date | null) {
  if (exportedAt === null) return 0
  const rows = await database
    .select({ id: changeLog.id })
    .from(changeLog)
    .where(
      and(
        eq(changeLog.monthId, monthId),
        isNotNull(changeLog.date),
        inArray(changeLog.action, [...DAY_CHANGE_ACTIONS]),
        gt(changeLog.createdAt, exportedAt),
      ),
    )
  return rows.length
}

/** The month's change log, newest first. */
export async function monthLog(database: Database, monthId: MonthId) {
  await findMonth(database, monthId)
  const rows = await database
    .select({
      id: changeLog.id,
      date: changeLog.date,
      action: changeLog.action,
      actorDevId: changeLog.actorDevId,
      actorNickname: devs.nickname,
      before: changeLog.before,
      after: changeLog.after,
      createdAt: changeLog.createdAt,
    })
    .from(changeLog)
    .leftJoin(devs, eq(devs.id, changeLog.actorDevId))
    .where(eq(changeLog.monthId, monthId))
    .orderBy(desc(changeLog.id))
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.getTime() }))
}
