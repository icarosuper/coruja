import { describe, expect, it } from 'vitest'
import { daysOfMonth, type IsoDate } from '../schedule/dates'
import { type DayKind, defaultCalendar, monthlyHoursByDev } from '../schedule/shifts'
import { parseCsv } from './csv'
import { readSheetRoster, SheetFormatError } from './roster'

// Fixtures are built in code with made-up nicknames: the real sheet never enters the repo.

type SheetOptions = {
  month: string
  kindOf?: (date: IsoDate) => DayKind
  /** Banking cell of a calendar hour. */
  bankingAt: (date: IsoDate, hour: number) => string
  dateFormat?: 'month_first' | 'day_first'
  delimiter?: ',' | ';'
}

function buildSheet({
  month,
  kindOf,
  bankingAt,
  dateFormat = 'month_first',
  delimiter = ',',
}: SheetOptions): string {
  const calendar = defaultCalendar(month)
  const kind = (date: IsoDate) => kindOf?.(date) ?? calendar.find((day) => day.date === date)?.kind
  const dates = daysOfMonth(month)
  const formatDate = (date: IsoDate) => {
    const [year, monthNumber, day] = date.split('-').map(Number)
    return dateFormat === 'month_first' ? `${monthNumber}/${day}/${year}` : `${day}/${monthNumber}/${year}`
  }
  const rows = [
    ['Horário', ...dates.flatMap((date) => [formatDate(date), '', ''])],
    ['', ...dates.flatMap(() => ['', '', ''])],
    ['Time', ...dates.flatMap(() => ['Sustentação', 'Banking', 'Infra'])],
    ...Array.from({ length: 24 }, (_, hour) => [
      `${hour}:00`,
      ...dates.flatMap((date) => {
        const isOfficeHours = kind(date) === 'workday' && hour >= 9 && hour < 18
        return isOfficeHours ? ['Expediente', '', ''] : ['', bankingAt(date, hour), 'infra-dev']
      }),
    ]),
    ['', 'AGENTE', '', 'HORAS'],
  ]
  return rows.map((row) => row.join(delimiter)).join('\r\n')
}

/** Who holds each shift: the shift of `date` covers its evening (or whole day) and the next morning. */
function bankingByShift(ownerOf: (shiftDate: IsoDate) => string) {
  return (date: IsoDate, hour: number) => {
    const isPreviousShiftMorning = hour < 9
    const shiftDate = isPreviousShiftMorning ? dayBefore(date) : date
    return ownerOf(shiftDate)
  }
}

function dayBefore(date: IsoDate): IsoDate {
  const day = Number(date.slice(8))
  return day === 1 ? '2026-10-31' : `${date.slice(0, 8)}${String(day - 1).padStart(2, '0')}`
}

const rotation = ['owl', 'hawk', 'kite']
const ownerByDay = (date: IsoDate) => rotation[Number(date.slice(8)) % rotation.length] ?? ''

describe('readSheetRoster', () => {
  const november = readSheetRoster(buildSheet({ month: '2026-11', bankingAt: bankingByShift(ownerByDay) }))
  const dayOf = (date: IsoDate) => november.days.find((day) => day.date === date)

  it('reads the month, the day kinds and one whole segment per shift', () => {
    expect(november.month).toBe('2026-11')
    expect(november.days).toHaveLength(30)
    expect(november.problems).toEqual([])
    expect(dayOf('2026-11-02')).toEqual({
      date: '2026-11-02',
      kind: 'day_off',
      segments: [{ devId: ownerByDay('2026-11-02'), fromHour: 0, toHour: 24 }],
    })
    expect(dayOf('2026-11-03')).toEqual({
      date: '2026-11-03',
      kind: 'workday',
      segments: [{ devId: ownerByDay('2026-11-03'), fromHour: 0, toHour: 15 }],
    })
  })

  it('gives the whole last shift to whoever holds its hours in the sheet', () => {
    expect(dayOf('2026-11-30')?.segments).toEqual([
      { devId: ownerByDay('2026-11-30'), fromHour: 0, toHour: 15 },
    ])
  })

  it('reports the hours of day 1 that belong to the previous month', () => {
    expect(Object.fromEntries(november.hoursFromPreviousMonth)).toEqual({ [ownerByDay('2026-10-31')]: 9 })
  })

  it('adds up to the month total once the previous month hours are counted', () => {
    const hours = monthlyHoursByDev(november.month, november.days)
    const hoursFromShifts = [...hours.values()].reduce((sum, value) => sum + value, 0)
    expect(hoursFromShifts + 9).toBe(549)
  })

  it('reads a split shift as consecutive segments', () => {
    const splitDate = '2026-11-03'
    const sheet = buildSheet({
      month: '2026-11',
      bankingAt: (date, hour) => {
        const isSplitEvening = date === splitDate && hour >= 18 && hour < 21
        return isSplitEvening ? 'wren' : bankingByShift(ownerByDay)(date, hour)
      },
    })
    expect(readSheetRoster(sheet).days.find((day) => day.date === splitDate)?.segments).toEqual([
      { devId: 'wren', fromHour: 0, toHour: 3 },
      { devId: ownerByDay(splitDate), fromHour: 3, toHour: 15 },
    ])
  })

  it('reads the day kind from the sheet, not from the holiday calendar', () => {
    const flipped = '2026-11-20'
    const sheet = buildSheet({
      month: '2026-11',
      kindOf: (date) =>
        date === flipped
          ? 'workday'
          : (defaultCalendar('2026-11').find((day) => day.date === date)?.kind ?? 'workday'),
      bankingAt: bankingByShift(ownerByDay),
    })
    expect(readSheetRoster(sheet).days.find((day) => day.date === flipped)?.kind).toBe('workday')
  })

  it('leaves an empty shift unassigned and flags a half-filled one', () => {
    const sheet = buildSheet({
      month: '2026-11',
      bankingAt: (date, hour) => {
        const shiftOwner = bankingByShift(ownerByDay)(date, hour)
        const isEmptyShift = date === '2026-11-04' && hour >= 18
        const isEmptyNextMorning = date === '2026-11-05' && hour < 9
        const isHalfEmptyShift = date === '2026-11-10' && hour >= 22
        return isEmptyShift || isEmptyNextMorning || isHalfEmptyShift ? '' : shiftOwner
      },
    })
    const roster = readSheetRoster(sheet)
    expect(roster.days.find((day) => day.date === '2026-11-04')?.segments).toEqual([])
    expect(roster.problems).toEqual([{ date: '2026-11-10', problem: 'partly_assigned' }])
  })

  it('accepts day-first dates, semicolons and quoted cells', () => {
    const sheet = buildSheet({
      month: '2026-11',
      bankingAt: bankingByShift(ownerByDay),
      dateFormat: 'day_first',
      delimiter: ';',
    }).replaceAll('Banking', '"Banking"')
    expect(readSheetRoster(sheet).days).toEqual(november.days)
  })

  it('rejects a file that is not the sheet', () => {
    const readError = (text: string) => {
      try {
        readSheetRoster(text)
      } catch (error) {
        return error instanceof SheetFormatError ? error.code : error
      }
    }
    const sheet = buildSheet({ month: '2026-11', bankingAt: bankingByShift(ownerByDay) })
    expect(readError('a,b\n1,2')).toBe('no_dates')
    expect(readError(sheet.replace('11/2/2026', '11/9/2026'))).toBe('dates_not_one_full_month')
    expect(readError(sheet.replaceAll('Banking', 'Bank'))).toBe('no_banking_column')
    expect(readError(sheet.replace('\r\n13:00', '\r\nxx'))).toBe('missing_hours')
  })
})

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, delimiters inside quotes and CRLF', () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n,x\r\n')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['', 'x'],
    ])
  })

  it('uses semicolons when the first line has more of them', () => {
    expect(parseCsv('a;b,c;d\n1;2')).toEqual([
      ['a', 'b,c', 'd'],
      ['1', '2'],
    ])
  })
})
