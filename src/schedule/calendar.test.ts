import { describe, expect, it } from 'vitest'
import { defaultMonth, monthsDueToOpen, opensOn, saoPauloDate } from './calendar'

describe('saoPauloDate', () => {
  it('is the date in São Paulo, not in UTC', () => {
    expect(saoPauloDate(new Date('2026-11-20T02:59:00Z'))).toBe('2026-11-19')
    expect(saoPauloDate(new Date('2026-11-20T03:00:00Z'))).toBe('2026-11-20')
  })
})

describe('defaultMonth and opensOn', () => {
  it('switch to the next month on the 20th', () => {
    expect(defaultMonth('2026-11-19')).toBe('2026-11')
    expect(defaultMonth('2026-12-20')).toBe('2027-01')
    expect(opensOn('2027-01')).toBe('2026-12-20')
  })
})

describe('monthsDueToOpen', () => {
  it('opens the next month from the 20th on, once', () => {
    expect(monthsDueToOpen('2026-11', '2026-11-19')).toEqual([])
    expect(monthsDueToOpen('2026-11', '2026-11-20')).toEqual(['2026-12'])
    expect(monthsDueToOpen('2026-12', '2026-11-21')).toEqual([])
  })

  it('catches up on months a missed run left behind, in order', () => {
    expect(monthsDueToOpen('2026-11', '2027-01-05')).toEqual(['2026-12', '2027-01'])
  })

  it('opens nothing before Coruja has a first month', () => {
    expect(monthsDueToOpen(null, '2026-11-20')).toEqual([])
  })
})
