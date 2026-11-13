import { describe, expect, it } from 'vitest'
import { defaultMonth, saoPauloDate } from './calendar'

describe('saoPauloDate', () => {
  it('is the date in São Paulo, not in UTC', () => {
    expect(saoPauloDate(new Date('2026-11-20T02:59:00Z'))).toBe('2026-11-19')
    expect(saoPauloDate(new Date('2026-11-20T03:00:00Z'))).toBe('2026-11-20')
  })
})

describe('defaultMonth', () => {
  it('switches to the next month on the 20th', () => {
    expect(defaultMonth('2026-11-19')).toBe('2026-11')
    expect(defaultMonth('2026-12-20')).toBe('2027-01')
  })
})
