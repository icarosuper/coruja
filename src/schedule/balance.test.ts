import { describe, expect, it } from 'vitest'
import { monthHoursByDev } from './balance'
import type { ShiftDay } from './shifts'

const workday = (date: string, devId: string): ShiftDay<string> => ({
  date,
  kind: 'workday',
  segments: [{ devId, fromHour: 0, toHour: 15 }],
})

describe('monthHoursByDev', () => {
  it('expects a share of the assigned hours in proportion to weight', () => {
    const days = [workday('2026-11-03', 'ana'), workday('2026-11-04', 'ana'), workday('2026-11-05', 'bia')]
    const hours = monthHoursByDev('2026-11', days, [
      { devId: 'ana', weight: 100 },
      { devId: 'bia', weight: 50 },
    ])
    expect(hours.get('ana')).toEqual({ hours: 30, expectedHours: 30 })
    expect(hours.get('bia')).toEqual({ hours: 15, expectedHours: 15 })
  })

  it('counts the previous month shift that runs into day 1', () => {
    const october31: ShiftDay<string> = {
      date: '2026-10-31',
      kind: 'day_off',
      segments: [{ devId: 'ana', fromHour: 0, toHour: 24 }],
    }
    const hours = monthHoursByDev(
      '2026-11',
      [october31, workday('2026-11-03', 'bia')],
      [
        { devId: 'ana', weight: 100 },
        { devId: 'bia', weight: 100 },
      ],
    )
    expect(hours.get('ana')).toEqual({ hours: 9, expectedHours: 12 })
    expect(hours.get('bia')).toEqual({ hours: 15, expectedHours: 12 })
  })

  it('gives participants without shifts their expected share and outsiders none', () => {
    const hours = monthHoursByDev('2026-11', [workday('2026-11-03', 'caio')], [{ devId: 'ana', weight: 100 }])
    expect(hours.get('ana')).toEqual({ hours: 0, expectedHours: 15 })
    expect(hours.get('caio')).toEqual({ hours: 15, expectedHours: 0 })
  })
})
