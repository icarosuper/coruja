import { monthHoursByDev } from '../../schedule/balance'
import { addDays, type MonthId, monthOf } from '../../schedule/dates'
import type { Database } from '../db/client'
import { balanceAdjustments, monthParticipants, months } from '../db/schema'
import { loadShiftDays, type StoredDay } from './shift-days'

// Balances are never stored (architecture.md, "Tables"): Σ over months (hours − expected share)
// plus balance adjustments. Small data (one team, ~30 days a month), so everything is read at once.

/**
 * Each dev's balance from every month **before** `month` (null = every month), plus the
 * adjustments of those months and the ones that belong to no month.
 */
export async function balancesBefore(
  database: Database,
  month: MonthId | null,
): Promise<Map<number, number>> {
  const balancesAt = await loadBalances(database)
  return balancesAt(month)
}

/** Reads everything once; the returned function gives the balances before any month. */
export async function loadBalances(
  database: Database,
): Promise<(month: MonthId | null) => Map<number, number>> {
  const [monthRows, participantRows, adjustmentRows, allDays] = await Promise.all([
    database.select({ id: months.id }).from(months),
    database.select().from(monthParticipants),
    database.select().from(balanceAdjustments),
    loadShiftDays(database, null),
  ])
  const balanceByMonth = new Map(
    monthRows.map(({ id: monthId }) => {
      const participants = participantRows.filter((participant) => participant.monthId === monthId)
      const hoursByDev = monthHoursByDev(monthId, daysCountingIn(monthId, allDays), participants)
      return [monthId, hoursByDev] as const
    }),
  )

  return (month) => {
    const counts = (monthId: MonthId) => month === null || monthId < month
    const balances = new Map<number, number>()
    const add = (devId: number, hours: number) => balances.set(devId, (balances.get(devId) ?? 0) + hours)
    for (const [monthId, hoursByDev] of balanceByMonth) {
      if (!counts(monthId)) continue
      for (const [devId, { hours, expectedHours }] of hoursByDev) add(devId, hours - expectedHours)
    }
    for (const adjustment of adjustmentRows) {
      const isCounted = adjustment.monthId === null || counts(adjustment.monthId)
      if (isCounted) add(adjustment.devId, adjustment.hours)
    }
    return balances
  }
}

/** The month's days plus the previous month's last day, whose shift runs into day 1. */
export function daysCountingIn(month: MonthId, allDays: StoredDay[]): StoredDay[] {
  const previousDate = addDays(`${month}-01`, -1)
  return allDays.filter((day) => monthOf(day.date) === month || day.date === previousDate)
}
