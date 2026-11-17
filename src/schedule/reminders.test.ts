import { describe, expect, it } from 'vitest'
import {
  MAX_REMINDER_DELAY_MS,
  type ReminderSettings,
  remindersDue,
  saoPauloInstant,
  shiftEndsAt,
} from './reminders'
import type { ShiftDay } from './shifts'

const OWL = 1
const HAWK = 2
const MINUTE = 60 * 1000

const workday = (date: string, devId = OWL): ShiftDay<number> => ({
  date,
  kind: 'workday',
  segments: [{ devId, fromHour: 0, toHour: 15 }],
})
const dayOff = (date: string, devId = OWL): ShiftDay<number> => ({
  date,
  kind: 'day_off',
  segments: [{ devId, fromHour: 0, toHour: 24 }],
})
const settings = (overrides: Partial<ReminderSettings>): Map<number, ReminderSettings> =>
  new Map([[OWL, { eve: null, day: null, shiftStart: false, ...overrides }]])

describe('saoPauloInstant', () => {
  it('reads the time in UTC−3', () => {
    expect(new Date(saoPauloInstant('2026-12-10', '18:30')).toISOString()).toBe('2026-12-10T21:30:00.000Z')
  })

  it('ends every shift at 09:00 the next day', () => {
    expect(new Date(shiftEndsAt('2026-12-31')).toISOString()).toBe('2027-01-01T12:00:00.000Z')
  })
})

describe('remindersDue', () => {
  it('reminds on the eve at the chosen time, across a month boundary', () => {
    const due = remindersDue({
      now: saoPauloInstant('2026-11-30', '20:15'),
      days: [workday('2026-12-01')],
      settingsByDev: settings({ eve: '20:15' }),
    })
    expect(due).toEqual([
      expect.objectContaining({
        devId: OWL,
        date: '2026-12-01',
        kind: 'eve',
        fromHour: 0,
        dayKind: 'workday',
      }),
    ])
  })

  it('reminds on the day and when the shift starts, by day kind', () => {
    const now = saoPauloInstant('2026-12-12', '09:00')
    const due = remindersDue({
      now,
      days: [dayOff('2026-12-12')],
      settingsByDev: settings({ day: '08:00', shiftStart: true }),
    })
    expect(due.map((reminder) => reminder.kind)).toEqual(['day', 'shift_start'])
    expect(due[1]?.dueAt).toBe(now)
  })

  it('waits until the time has come', () => {
    const due = remindersDue({
      now: saoPauloInstant('2026-12-10', '17:59'),
      days: [workday('2026-12-10')],
      settingsByDev: settings({ shiftStart: true }),
    })
    expect(due).toEqual([])
  })

  it('catches up a late reminder, but not one later than the limit', () => {
    const dueAt = saoPauloInstant('2026-12-09', '18:00')
    const remindAt = (now: number) =>
      remindersDue({ now, days: [workday('2026-12-10')], settingsByDev: settings({ eve: '18:00' }) })
    expect(remindAt(dueAt + MAX_REMINDER_DELAY_MS)).toHaveLength(1)
    expect(remindAt(dueAt + MAX_REMINDER_DELAY_MS + MINUTE)).toEqual([])
  })

  it('gives each part of a split shift its own start, with only the dev’s segments', () => {
    const split: ShiftDay<number> = {
      date: '2026-12-10',
      kind: 'workday',
      segments: [
        { devId: OWL, fromHour: 0, toHour: 5 },
        { devId: HAWK, fromHour: 5, toHour: 10 },
        { devId: OWL, fromHour: 10, toHour: 15 },
      ],
    }
    const atFourAm = remindersDue({
      now: saoPauloInstant('2026-12-11', '04:00'),
      days: [split],
      settingsByDev: settings({ shiftStart: true }),
    })
    expect(atFourAm).toEqual([
      expect.objectContaining({
        kind: 'shift_start',
        fromHour: 10,
        segments: [
          { devId: OWL, fromHour: 0, toHour: 5 },
          { devId: OWL, fromHour: 10, toHour: 15 },
        ],
      }),
    ])
  })

  it('skips devs without settings and days nobody covers', () => {
    const due = remindersDue({
      now: saoPauloInstant('2026-12-09', '18:00'),
      days: [workday('2026-12-10', HAWK), { date: '2026-12-11', kind: 'workday', segments: [] }],
      settingsByDev: settings({ eve: '18:00' }),
    })
    expect(due).toEqual([])
  })
})
