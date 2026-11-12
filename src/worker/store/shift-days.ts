import { and, asc, gte, lte } from 'drizzle-orm'
import type { IsoDate } from '../../schedule/dates'
import type { ShiftDay } from '../../schedule/shifts'
import type { Database } from '../db/client'
import { days, shiftSegments } from '../db/schema'

export type StoredDay = ShiftDay<number> & { monthId: string; holidayName: string | null }

/** Days between two dates (inclusive) with their segments, in date and hour order. */
export async function loadShiftDays(
  database: Database,
  range: { fromDate: IsoDate; toDate: IsoDate } | null,
): Promise<StoredDay[]> {
  const dayRows = await database
    .select()
    .from(days)
    .where(range ? and(gte(days.date, range.fromDate), lte(days.date, range.toDate)) : undefined)
    .orderBy(asc(days.date))
  const dates = dayRows.map((day) => day.date)
  const segmentRows =
    dates.length === 0
      ? []
      : await database
          .select()
          .from(shiftSegments)
          .where(
            range
              ? and(gte(shiftSegments.date, range.fromDate), lte(shiftSegments.date, range.toDate))
              : undefined,
          )
          .orderBy(asc(shiftSegments.date), asc(shiftSegments.fromHour))

  const segmentsByDate = new Map<IsoDate, ShiftDay<number>['segments']>()
  for (const segment of segmentRows) {
    const daySegments = segmentsByDate.get(segment.date) ?? []
    daySegments.push({ devId: segment.devId, fromHour: segment.fromHour, toHour: segment.toHour })
    segmentsByDate.set(segment.date, daySegments)
  }
  return dayRows.map((day) => ({
    date: day.date,
    kind: day.kind,
    monthId: day.monthId,
    holidayName: day.holidayName,
    segments: segmentsByDate.get(day.date) ?? [],
  }))
}

/** The days of the given dates, keyed by date. */
export async function loadShiftDaysOn(
  database: Database,
  dates: IsoDate[],
): Promise<Map<IsoDate, StoredDay>> {
  if (dates.length === 0) return new Map()
  const sorted = [...dates].sort()
  const loaded = await loadShiftDays(database, { fromDate: sorted[0] ?? '', toDate: sorted.at(-1) ?? '' })
  const wanted = new Set(dates)
  return new Map(loaded.filter((day) => wanted.has(day.date)).map((day) => [day.date, day]))
}
