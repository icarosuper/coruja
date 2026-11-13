import { describe, expect, it } from 'vitest'
import { daysOfMonth, weekdayOf } from './dates'
import type { PreferenceRule } from './preferences'
import { absencesWithDays, preferenceOn } from './preferences'
import { type SchedulerDev, type SuggestInput, suggestRoster } from './scheduler'
import { defaultCalendar, monthlyHoursByDev, type ShiftDay } from './shifts'

const MONTH = '2026-11'
const SUNDAY = 0
const THURSDAY = 4
const SATURDAY = 6
const LONGEST_SHIFT_HOURS = 24

function dev(id: string, overrides: Partial<SchedulerDev<string>> = {}): SchedulerDev<string> {
  return { id, weight: 100, balance: 0, rules: [], absences: [], ...overrides }
}

function suggest(devs: SchedulerDev<string>[], overrides: Partial<SuggestInput<string>> = {}) {
  return suggestRoster({
    month: MONTH,
    calendar: defaultCalendar(MONTH),
    previousDay: null,
    devs,
    ...overrides,
  })
}

const ownerOf = (day: ShiftDay<string>) => day.segments[0]?.devId
const datesOf = (days: ShiftDay<string>[], devId: string) =>
  days.filter((day) => ownerOf(day) === devId).map((day) => day.date)
const team = ['ana', 'bia', 'caio', 'davi', 'enzo', 'febe'].map((id) => dev(id))

describe('suggestRoster', () => {
  it('gives every day one dev covering the whole shift', () => {
    const { days, unassignedDates } = suggest(team)
    expect(days).toHaveLength(30)
    expect(unassignedDates).toEqual([])
    for (const day of days) {
      expect(day.segments).toEqual([
        { devId: expect.any(String), fromHour: 0, toHour: day.kind === 'day_off' ? 24 : 15 },
      ])
    }
  })

  it('never assigns a day someone cannot take, absences included', () => {
    const noSundays: PreferenceRule = { kind: 'weekday', value: SUNDAY, preference: 'cant' }
    const devs = [
      dev('ana', { rules: [noSundays] }),
      dev('bia', { absences: [{ fromDate: '2026-11-10', toDate: '2026-11-20' }] }),
      ...team.slice(2),
    ]
    const { days } = suggest(devs)
    expect(datesOf(days, 'ana').some((date) => weekdayOf(date) === SUNDAY)).toBe(false)
    expect(datesOf(days, 'bia').some((date) => date >= '2026-11-10' && date <= '2026-11-20')).toBe(false)
  })

  it('leaves a day unassigned when nobody can take it', () => {
    const awayOn15th = [{ fromDate: '2026-11-15', toDate: '2026-11-15' }]
    const { days, unassignedDates } = suggest(team.map((member) => ({ ...member, absences: awayOn15th })))
    expect(unassignedDates).toEqual(['2026-11-15'])
    expect(days.find((day) => day.date === '2026-11-15')?.segments).toEqual([])
  })

  it('splits hours in proportion to weight, within one shift', () => {
    const devs = [...team, dev('gil', { weight: 50 }), dev('hugo', { weight: 0 })]
    const { days } = suggest(devs)
    const hours = monthlyHoursByDev(MONTH, days)
    const totalHours = [...hours.values()].reduce((sum, value) => sum + value, 0)
    const totalWeight = devs.reduce((sum, member) => sum + member.weight, 0)

    for (const member of devs) {
      const share = (member.weight / totalWeight) * totalHours
      expect(Math.abs((hours.get(member.id) ?? 0) - share)).toBeLessThanOrEqual(LONGEST_SHIFT_HOURS)
    }
    expect(hours.get('hugo')).toBeUndefined()
  })

  it('gives fewer hours to whoever carries more from previous months', () => {
    const devs = team.map((member) => (member.id === 'ana' ? { ...member, balance: 40 } : member))
    const hours = monthlyHoursByDev(MONTH, suggest(devs).days)
    const othersAverage =
      team.slice(1).reduce((sum, member) => sum + (hours.get(member.id) ?? 0), 0) / (team.length - 1)
    expect(hours.get('ana') ?? 0).toBeLessThan(othersAverage - 15)
  })

  it('counts the previous month shift that runs into day 1', () => {
    const previousDay: ShiftDay<string> = {
      date: '2026-10-31',
      kind: 'day_off',
      segments: [{ devId: 'ana', fromHour: 0, toHour: 24 }],
    }
    const { days } = suggest(team, { previousDay })
    const hours = monthlyHoursByDev(MONTH, [previousDay, ...days])
    const totalHours = [...hours.values()].reduce((sum, value) => sum + value, 0)
    expect(totalHours).toBe(549)
    expect(ownerOf(days[0] as ShiftDay<string>)).not.toBe('ana')
  })

  it('spreads weekend and holiday shifts', () => {
    const { days } = suggest(team)
    const daysOffPerDev = team.map(
      (member) => days.filter((day) => day.kind === 'day_off' && ownerOf(day) === member.id).length,
    )
    expect(Math.max(...daysOffPerDev) - Math.min(...daysOffPerDev)).toBeLessThanOrEqual(1)
  })

  it('stays away from avoid days and takes good days when hours allow', () => {
    const avoidsSaturday: PreferenceRule = { kind: 'weekday', value: SATURDAY, preference: 'avoid' }
    const likesThursday: PreferenceRule = { kind: 'weekday', value: THURSDAY, preference: 'good' }
    const devs = [dev('ana', { rules: [avoidsSaturday, likesThursday] }), ...team.slice(1)]
    const anaDates = datesOf(suggest(devs).days, 'ana')
    const thursdays = daysOfMonth(MONTH).filter((date) => weekdayOf(date) === THURSDAY)
    expect(anaDates.some((date) => weekdayOf(date) === SATURDAY)).toBe(false)
    expect(anaDates.filter((date) => thursdays.includes(date)).length).toBeGreaterThanOrEqual(2)
  })

  it('avoids back-to-back shifts when there are enough devs', () => {
    const { days } = suggest(team)
    const backToBack = days.filter(
      (day, index) => index > 0 && ownerOf(day) === ownerOf(days[index - 1] as ShiftDay<string>),
    )
    expect(backToBack).toEqual([])
  })

  it('still fills every day when back-to-back cannot be avoided', () => {
    const { days, unassignedDates } = suggest([dev('ana')])
    expect(unassignedDates).toEqual([])
    expect(datesOf(days, 'ana')).toHaveLength(30)
  })

  it('gives the same roster for the same input', () => {
    expect(suggest(team)).toEqual(suggest(team))
  })
})

describe('preferenceOn', () => {
  const rules: PreferenceRule[] = [{ kind: 'weekday', value: THURSDAY, preference: 'good' }]

  it('is neutral when no rule matches', () => {
    expect(preferenceOn('2026-11-03', rules, [])).toBeNull()
  })

  it("takes the weekday's rule", () => {
    expect(preferenceOn('2026-11-19', rules, [])).toBe('good') // Thursday
  })

  it('treats an absence as cant, both ends included, over any weekday rule', () => {
    const absences = [{ fromDate: '2026-11-19', toDate: '2026-11-21' }]
    expect(preferenceOn('2026-11-19', rules, absences)).toBe('cant') // a good Thursday
    expect(preferenceOn('2026-11-21', rules, absences)).toBe('cant')
    expect(preferenceOn('2026-11-22', rules, absences)).toBeNull()
  })
})

describe('absencesWithDays', () => {
  const day = (date: string) => ({ fromDate: date, toDate: date })
  const periods = [
    { fromDate: '2026-12-03', toDate: '2026-12-05' },
    { fromDate: '2026-12-10', toDate: '2026-12-12' },
  ]

  it('adds a lone day as its own period', () => {
    expect(absencesWithDays(periods, day('2026-12-20'), true)).toEqual([...periods, day('2026-12-20')])
  })

  it('joins a day that touches or bridges periods', () => {
    expect(absencesWithDays(periods, day('2026-12-06'), true)[0]).toEqual({
      fromDate: '2026-12-03',
      toDate: '2026-12-06',
    })
    const bridged = absencesWithDays(periods, { fromDate: '2026-12-06', toDate: '2026-12-09' }, true)
    expect(bridged).toEqual([{ fromDate: '2026-12-03', toDate: '2026-12-12' }])
  })

  it('splits a period when a day in the middle is cleared', () => {
    expect(absencesWithDays(periods, day('2026-12-04'), false)).toEqual([
      day('2026-12-03'),
      day('2026-12-05'),
      periods[1],
    ])
  })

  it('clears a range across periods and the month boundary', () => {
    const longTrip = [{ fromDate: '2026-12-28', toDate: '2027-01-04' }]
    expect(absencesWithDays(longTrip, { fromDate: '2026-12-30', toDate: '2027-01-02' }, false)).toEqual([
      { fromDate: '2026-12-28', toDate: '2026-12-29' },
      { fromDate: '2027-01-03', toDate: '2027-01-04' },
    ])
  })

  it('changes nothing when the days are already as asked', () => {
    expect(absencesWithDays(periods, day('2026-12-04'), true)).toEqual(periods)
    expect(absencesWithDays(periods, day('2026-12-07'), false)).toEqual(periods)
  })
})
