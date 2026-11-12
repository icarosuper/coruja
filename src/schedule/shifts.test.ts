import { describe, expect, it } from 'vitest'
import { addDays, daysOfMonth, previousMonth, weekdayOf } from './dates'
import {
  defaultCalendar,
  findSegmentProblem,
  monthlyHoursByDev,
  monthTotalHours,
  type ShiftDay,
  segmentHoursByMonth,
} from './shifts'

describe('dates', () => {
  it('walks across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(previousMonth('2027-01')).toBe('2026-12')
  })

  it('knows weekdays and month lengths', () => {
    const sunday = 0
    expect(weekdayOf('2026-11-01')).toBe(sunday)
    expect(daysOfMonth('2026-11')).toHaveLength(30)
    expect(daysOfMonth('2028-02')).toHaveLength(29)
  })
})

describe('defaultCalendar', () => {
  const november = defaultCalendar('2026-11')
  const kindOf = (date: string) => november.find((day) => day.date === date)?.kind

  it('makes weekends and holidays 24h days, like the November 2026 sheet', () => {
    expect(kindOf('2026-11-01')).toBe('day_off') // Sunday
    expect(kindOf('2026-11-02')).toBe('day_off') // Finados, Monday
    expect(kindOf('2026-11-03')).toBe('workday')
    expect(kindOf('2026-11-20')).toBe('day_off') // Consciência Negra, Friday
    expect(kindOf('2026-11-30')).toBe('workday')
  })

  it('keeps the holiday name for display', () => {
    expect(november.find((day) => day.date === '2026-11-02')?.holidayName).toBe('Finados')
    expect(november.find((day) => day.date === '2026-11-03')?.holidayName).toBeNull()
  })
})

describe('segmentHoursByMonth', () => {
  it('splits a month-end shift between both months (Nov 30 → 6h Nov, 9h Dec)', () => {
    const hours = segmentHoursByMonth('2026-11-30', 'workday', 0, 15)
    expect(Object.fromEntries(hours)).toEqual({ '2026-11': 6, '2026-12': 9 })
  })

  it('splits a 24h shift at midnight (09:00→24:00 = 15h, then 9h)', () => {
    const hours = segmentHoursByMonth('2026-10-31', 'day_off', 0, 24)
    expect(Object.fromEntries(hours)).toEqual({ '2026-10': 15, '2026-11': 9 })
  })

  it('counts only the segment hours of a split shift', () => {
    const afterMidnightOnly = segmentHoursByMonth('2026-11-30', 'workday', 8, 15)
    expect(Object.fromEntries(afterMidnightOnly)).toEqual({ '2026-12': 7 })
  })
})

describe('monthTotalHours', () => {
  it('gives the 549h of the November 2026 sheet', () => {
    const octoberLastDay = { date: '2026-10-31', kind: 'day_off' as const }
    const november = defaultCalendar('2026-11')
    expect(monthTotalHours('2026-11', [octoberLastDay, ...november])).toBe(549)
  })
})

describe('monthlyHoursByDev', () => {
  it('counts by calendar hour, including the previous month spilling into day 1', () => {
    const days: ShiftDay<string>[] = [
      { date: '2026-10-31', kind: 'day_off', segments: [{ devId: 'A', fromHour: 0, toHour: 24 }] },
      { date: '2026-11-01', kind: 'day_off', segments: [{ devId: 'A', fromHour: 0, toHour: 24 }] },
      {
        date: '2026-11-02',
        kind: 'day_off',
        segments: [
          { devId: 'B', fromHour: 0, toHour: 10 },
          { devId: 'C', fromHour: 10, toHour: 24 },
        ],
      },
      { date: '2026-11-30', kind: 'workday', segments: [{ devId: 'B', fromHour: 0, toHour: 15 }] },
      { date: '2026-11-03', kind: 'workday', segments: [] },
    ]
    const hours = monthlyHoursByDev('2026-11', days)
    expect(Object.fromEntries(hours)).toEqual({ A: 33, B: 16, C: 14 })
  })
})

describe('findSegmentProblem', () => {
  it('accepts an unassigned day and a whole or cleanly split shift', () => {
    expect(findSegmentProblem('workday', [])).toBeNull()
    expect(findSegmentProblem('workday', [{ devId: 1, fromHour: 0, toHour: 15 }])).toBeNull()
    expect(
      findSegmentProblem('day_off', [
        { devId: 2, fromHour: 12, toHour: 24 },
        { devId: 1, fromHour: 0, toHour: 12 },
      ]),
    ).toBeNull()
  })

  it('rejects gaps, overlaps and hours outside the shift', () => {
    expect(findSegmentProblem('workday', [{ devId: 1, fromHour: 0, toHour: 10 }])).toBe('gap')
    expect(
      findSegmentProblem('workday', [
        { devId: 1, fromHour: 0, toHour: 8 },
        { devId: 2, fromHour: 9, toHour: 15 },
      ]),
    ).toBe('gap')
    expect(
      findSegmentProblem('workday', [
        { devId: 1, fromHour: 0, toHour: 9 },
        { devId: 2, fromHour: 8, toHour: 15 },
      ]),
    ).toBe('overlap')
    expect(findSegmentProblem('workday', [{ devId: 1, fromHour: 0, toHour: 24 }])).toBe('out_of_range')
    expect(findSegmentProblem('workday', [{ devId: 1, fromHour: 5, toHour: 5 }])).toBe('out_of_range')
  })
})
