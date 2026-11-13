import { eq } from 'drizzle-orm'
import { daysOfMonth, type MonthId } from '../../schedule/dates'
import { defaultCalendar, type ShiftDay } from '../../schedule/shifts'
import { readSheetRoster, SheetFormatError, type SheetRoster } from '../../sheet/roster'
import type { Database } from '../db/client'
import {
  balanceAdjustments,
  changeLog,
  days,
  devs,
  monthParticipants,
  months,
  shiftSegments,
} from '../db/schema'
import { ApiError } from '../errors'
import { insertRows, runBatch } from './batch'
import { resolveNicknames } from './devs'
import { type DayChange, ensureMonthCanBeAdded, sortedSegments } from './months'
import { loadShiftDays } from './shift-days'

// The manager's sheet exported as CSV, read by the one parser (decisions #16, #23). The CSV arrives
// as text: the web app decodes the Windows-1252 bytes before sending it.

/** Reads the sheet, refusing files we cannot read and days the sheet itself got wrong. */
function readRoster(csvText: string): SheetRoster {
  let roster: SheetRoster
  try {
    roster = readSheetRoster(csvText)
  } catch (error) {
    if (error instanceof SheetFormatError) throw new ApiError(422, 'unreadable_sheet', { reason: error.code })
    throw error
  }
  const hasProblems = roster.problems.length > 0
  if (hasProblems) throw new ApiError(422, 'sheet_problems', { problems: roster.problems })
  return roster
}

/** The sheet's nicknames turned into dev ids; any nickname that is not a dev refuses the file. */
async function withDevIds(database: Database, roster: SheetRoster) {
  const nicknames = [
    ...roster.days.flatMap((day) => day.segments.map((segment) => segment.devId)),
    ...roster.hoursFromPreviousMonth.keys(),
  ]
  const { found, unknown } = await resolveNicknames(database, nicknames)
  if (unknown.length > 0) throw new ApiError(422, 'unknown_nicknames', { nicknames: unknown })
  const idOf = (nickname: string) => found.get(nickname) ?? 0

  const shiftDays: ShiftDay<number>[] = roster.days.map((day) => ({
    ...day,
    segments: day.segments.map((segment) => ({ ...segment, devId: idOf(segment.devId) })),
  }))
  const hoursFromPreviousMonth = new Map(
    [...roster.hoursFromPreviousMonth].map(([nickname, hours]) => [idOf(nickname), hours]),
  )
  return { shiftDays, hoursFromPreviousMonth }
}

/**
 * Imports a month from the sheet as already exported: the sheet has it (decisions #16): its days and segments, and as
 * participants every active dev with a weight above 0 plus anyone named in the sheet. Create the
 * devs and set their weights first.
 *
 * Day 1 before 09:00 belongs to the previous month's last shift, which is not in the app. Those
 * hours enter as `import` adjustments that give each participant exactly what counting that shift
 * would: its hours minus their weighted share of them.
 */
export async function importMonth(database: Database, csvText: string) {
  const roster = readRoster(csvText)
  const monthId = roster.month
  await ensureMonthCanBeAdded(database, monthId)
  const { shiftDays, hoursFromPreviousMonth } = await withDevIds(database, roster)

  const namedDevIds = new Set([
    ...shiftDays.flatMap((day) => day.segments.map((segment) => segment.devId)),
    ...hoursFromPreviousMonth.keys(),
  ])
  const allDevs = await database.select({ id: devs.id, weight: devs.weight, active: devs.active }).from(devs)
  const participants = allDevs.filter((dev) => namedDevIds.has(dev.id) || (dev.active && dev.weight > 0))
  const adjustments = previousShiftAdjustments(hoursFromPreviousMonth, participants)
  const holidayNames = new Map(defaultCalendar(monthId).map((day) => [day.date, day.holidayName]))

  const now = new Date()
  await runBatch(database, [
    database.insert(months).values({ id: monthId, openedAt: now, exportedAt: now, exportedByDevId: null }),
    ...insertRows(
      database,
      monthParticipants,
      participants.map((dev) => ({ monthId, devId: dev.id, weight: dev.weight })),
    ),
    ...insertRows(
      database,
      days,
      shiftDays.map((day) => ({
        date: day.date,
        monthId,
        kind: day.kind,
        holidayName: holidayNames.get(day.date) ?? null,
      })),
    ),
    ...insertRows(
      database,
      shiftSegments,
      shiftDays.flatMap((day) => day.segments.map((segment) => ({ date: day.date, ...segment }))),
    ),
    ...insertRows(
      database,
      balanceAdjustments,
      adjustments.map((adjustment) => ({
        ...adjustment,
        monthId,
        reason: 'import' as const,
        createdAt: now,
      })),
    ),
    database.insert(changeLog).values({ monthId, action: 'import', createdAt: now }),
  ])
  return {
    month: monthId,
    participantCount: participants.length,
    unassignedDates: shiftDays.filter((day) => day.segments.length === 0).map((day) => day.date),
  }
}

function previousShiftAdjustments(
  hoursByDev: Map<number, number>,
  participants: ReadonlyArray<{ id: number; weight: number }>,
): Array<{ devId: number; hours: number }> {
  const totalHours = [...hoursByDev.values()].reduce((sum, hours) => sum + hours, 0)
  const totalWeight = participants.reduce((sum, dev) => sum + dev.weight, 0)
  return participants
    .map((dev) => {
      const share = totalWeight > 0 ? dev.weight / totalWeight : 0
      return { devId: dev.id, hours: (hoursByDev.get(dev.id) ?? 0) - share * totalHours }
    })
    .filter((adjustment) => adjustment.hours !== 0)
}

/**
 * What the sheet says differently from the month's roster (decisions #23), one entry per day.
 * `after` can be sent back as is to apply the changes.
 */
export async function sheetDifferences(database: Database, monthId: MonthId, csvText: string) {
  const roster = readRoster(csvText)
  const isSameMonth = roster.month === monthId
  if (!isSameMonth) throw new ApiError(422, 'sheet_of_another_month', { sheetMonth: roster.month })
  const month = await database.query.months.findFirst({ where: eq(months.id, monthId) })
  if (!month) throw new ApiError(404, 'month_not_found')

  const { shiftDays: sheetDays } = await withDevIds(database, roster)
  const dates = daysOfMonth(monthId)
  const currentDays = await loadShiftDays(database, { fromDate: dates[0] ?? '', toDate: dates.at(-1) ?? '' })

  const differences: Array<{
    date: string
    before: Omit<DayChange, 'date'>
    after: Omit<DayChange, 'date'>
  }> = []
  for (const sheetDay of sheetDays) {
    const current = currentDays.find((day) => day.date === sheetDay.date)
    if (!current) continue
    const before = { kind: current.kind, segments: sortedSegments(current.segments) }
    const after = { kind: sheetDay.kind, segments: sortedSegments(sheetDay.segments) }
    const isDifferent = JSON.stringify(before) !== JSON.stringify(after)
    if (isDifferent) differences.push({ date: sheetDay.date, before, after })
  }
  return differences
}
