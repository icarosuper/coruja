import { describe, expect, it } from 'vitest'
import { easterSunday, saoPauloHolidays } from './holidays'

describe('easterSunday', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
  ])('%i → %s', (year, expected) => {
    expect(easterSunday(year)).toBe(expected)
  })
})

describe('saoPauloHolidays', () => {
  const holidays2026 = saoPauloHolidays(2026)

  it('has national, state and city holidays', () => {
    expect(holidays2026.get('2026-11-20')).toBe('Dia da Consciência Negra')
    expect(holidays2026.get('2026-07-09')).toBe('Revolução Constitucionalista')
    expect(holidays2026.get('2026-01-25')).toBe('Aniversário de São Paulo')
  })

  it('places the movable holidays from Easter', () => {
    expect(holidays2026.get('2026-04-03')).toBe('Sexta-feira Santa')
    expect(holidays2026.get('2026-06-04')).toBe('Corpus Christi')
  })

  it('does not treat Carnaval as a holiday', () => {
    const carnavalTuesday2026 = '2026-02-17'
    expect(holidays2026.has(carnavalTuesday2026)).toBe(false)
  })

  it('has 13 holidays a year', () => {
    expect(holidays2026.size).toBe(13)
  })
})
