import type { MonthId } from './dates'
import { monthlyHoursByDev, type ShiftDay } from './shifts'

// Hour balance (decisions #18, #19): each month, what a dev took minus their expected share.
// The share is of the hours actually assigned, so a month's balances always add up to zero.

export type Participant<DevId> = { devId: DevId; weight: number }
export type MonthHours = { hours: number; expectedHours: number }

/**
 * Hours each dev took in `month` and their expected share by participation weight. Pass the
 * month's days **and** the previous month's last day (its shift runs into day 1). A dev with hours
 * who is not a participant is expected to take none.
 */
export function monthHoursByDev<DevId>(
  month: MonthId,
  days: ShiftDay<DevId>[],
  participants: ReadonlyArray<Participant<DevId>>,
): Map<DevId, MonthHours> {
  const hoursByDev = monthlyHoursByDev(month, days)
  const assignedHours = [...hoursByDev.values()].reduce((sum, hours) => sum + hours, 0)
  const totalWeight = participants.reduce((sum, participant) => sum + participant.weight, 0)

  const result = new Map<DevId, MonthHours>()
  for (const participant of participants) {
    const share = totalWeight > 0 ? participant.weight / totalWeight : 0
    result.set(participant.devId, {
      hours: hoursByDev.get(participant.devId) ?? 0,
      expectedHours: share * assignedHours,
    })
  }
  for (const [devId, hours] of hoursByDev) {
    const isParticipant = result.has(devId)
    if (!isParticipant) result.set(devId, { hours, expectedHours: 0 })
  }
  return result
}
