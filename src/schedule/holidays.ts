import { addDays, type IsoDate, makeDate } from './dates'

// Holidays valid in the city of São Paulo (decisions #14): national, state and city.
// Carnaval is an optional day off, not a holiday, so it is not here.
// Names are shown in the UI, hence in Portuguese.

const FIXED_HOLIDAYS: ReadonlyArray<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: 'Confraternização Universal' },
  { month: 1, day: 25, name: 'Aniversário de São Paulo' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 7, day: 9, name: 'Revolução Constitucionalista' },
  { month: 9, day: 7, name: 'Independência do Brasil' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  { month: 11, day: 20, name: 'Dia da Consciência Negra' },
  { month: 12, day: 25, name: 'Natal' },
]

const GOOD_FRIDAY_OFFSET_FROM_EASTER = -2
const CORPUS_CHRISTI_OFFSET_FROM_EASTER = 60

/** Easter Sunday in the Gregorian calendar (anonymous Gregorian algorithm). */
export function easterSunday(year: number): IsoDate {
  const goldenNumber = year % 19
  const century = Math.floor(year / 100)
  const yearOfCentury = year % 100
  const leapCenturies = Math.floor(century / 4)
  const centuryRemainder = century % 4
  const moonCorrection = Math.floor((century + 8) / 25)
  const solarCorrection = Math.floor((century - moonCorrection + 1) / 3)
  const epact = (19 * goldenNumber + century - leapCenturies - solarCorrection + 15) % 30
  const leapYearsOfCentury = Math.floor(yearOfCentury / 4)
  const yearRemainder = yearOfCentury % 4
  const weekdayCorrection = (32 + 2 * centuryRemainder + 2 * leapYearsOfCentury - epact - yearRemainder) % 7
  const marchCorrection = Math.floor((goldenNumber + 11 * epact + 22 * weekdayCorrection) / 451)
  const monthAndDay = epact + weekdayCorrection - 7 * marchCorrection + 114
  const month = Math.floor(monthAndDay / 31)
  const day = (monthAndDay % 31) + 1
  return makeDate(year, month, day)
}

/** Every São Paulo holiday of the year, keyed by date. */
export function saoPauloHolidays(year: number): Map<IsoDate, string> {
  const holidays = new Map<IsoDate, string>()
  for (const holiday of FIXED_HOLIDAYS) {
    holidays.set(makeDate(year, holiday.month, holiday.day), holiday.name)
  }
  const easter = easterSunday(year)
  holidays.set(addDays(easter, GOOD_FRIDAY_OFFSET_FROM_EASTER), 'Sexta-feira Santa')
  holidays.set(addDays(easter, CORPUS_CHRISTI_OFFSET_FROM_EASTER), 'Corpus Christi')
  return holidays
}
