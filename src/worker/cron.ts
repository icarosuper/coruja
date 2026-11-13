import { monthsDueToOpen } from '../schedule/calendar'
import type { IsoDate, MonthId } from '../schedule/dates'
import type { Database } from './db/client'
import { listMonths, openMonth } from './store/months'

/**
 * The daily cron (decisions #7): opens the next month on the 20th, São Paulo time, with the
 * suggested roster. Runs every day, so a failed run is made up the next day; opening a month that
 * already exists does nothing.
 */
export async function openDueMonths(database: Database, date: IsoDate): Promise<MonthId[]> {
  const existing = await listMonths(database)
  const newestMonth = existing[0]?.id ?? null
  const due = monthsDueToOpen(newestMonth, date)
  for (const month of due) await openMonth(database, month, null)
  return due
}
