import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { IsoDate } from '../schedule/dates'
import { defaultCalendar, type ShiftDay, shiftLength } from '../schedule/shifts'
import { parseCsv } from './csv'
import { bankingCells, officeScript, pasteGrid } from './export'
import { readSheetRoster } from './roster'
import { buildSheet } from './testing/build-sheet'

const MONTH = '2026-11'
const rotation = ['owl', 'hawk', 'kite']
const ownerByDay = (date: IsoDate) => rotation[Number(date.slice(8)) % rotation.length] ?? ''
const previousDay: ShiftDay<string> = {
  date: '2026-10-31',
  kind: 'day_off',
  segments: [{ devId: 'wren', fromHour: 0, toHour: 24 }],
}
const monthDays: ShiftDay<string>[] = defaultCalendar(MONTH).map((day) => ({
  date: day.date,
  kind: day.kind,
  segments: [{ devId: ownerByDay(day.date), fromHour: 0, toHour: shiftLength(day.kind) }],
}))
const cells = bankingCells(MONTH, [previousDay, ...monthDays])

type Cell = string | number
/** The manager's sheet with empty Banking cells, as Excel would hold it. */
const emptySheet = () => parseCsv(buildSheet({ month: MONTH, bankingAt: () => '' })) as Cell[][]
const toCsv = (grid: Cell[][]) => grid.map((row) => row.join(',')).join('\r\n')

/** Runs the generated Office Script against an in-memory sheet with the ExcelScript calls it uses. */
function runScript(script: string, grid: Cell[][]) {
  const logs: string[] = []
  const javascript = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  const main = new Function('console', `${javascript.outputText}\nreturn main`)({
    log: (line: string) => logs.push(line),
  })
  const workbook = {
    getActiveWorksheet: () => ({
      getUsedRange: () => ({
        getValues: () => grid,
        getTexts: () => grid.map((row) => row.map(String)),
        getRowIndex: () => 0,
        getColumnIndex: () => 0,
      }),
      getCell: (row: number, column: number) => ({
        setValue: (value: string) => {
          ;(grid[row] as Cell[])[column] = value
        },
      }),
    }),
  }
  main(workbook)
  return logs
}

describe('bankingCells', () => {
  it('fills the hours each shift covers and clears office hours of workdays', () => {
    expect(cells.get('2026-11-01')?.slice(0, 9)).toEqual(Array(9).fill('wren'))
    expect(cells.get('2026-11-03')?.slice(0, 9)).toEqual(Array(9).fill(ownerByDay('2026-11-02')))
    expect(cells.get('2026-11-03')?.slice(9, 18)).toEqual(Array(9).fill(''))
    expect(cells.get('2026-11-03')?.slice(18)).toEqual(Array(6).fill(ownerByDay('2026-11-03')))
  })

  it('leaves day 1 alone when the previous shift is unknown', () => {
    expect(bankingCells(MONTH, monthDays).get('2026-11-01')?.slice(0, 9)).toEqual(Array(9).fill(null))
  })
})

describe('officeScript', () => {
  it('fills the Banking column so the sheet reads back as the roster', () => {
    const grid = emptySheet()
    const logs = runScript(officeScript(MONTH, cells), grid)
    const roster = readSheetRoster(toCsv(grid))
    expect(roster.problems).toEqual([])
    expect(roster.days).toEqual(monthDays)
    expect(Object.fromEntries(roster.hoursFromPreviousMonth)).toEqual({ wren: 9 })
    expect(logs[0]).toMatch(/^Coruja: \d+ células/)
  })

  it('finds dates written as Excel serial numbers and hours written as times', () => {
    const grid = emptySheet()
    const dateRow = grid[0] as Cell[]
    dateRow.forEach((cell, column) => {
      const [month, day, year] = String(cell).split('/').map(Number)
      if (year) dateRow[column] = Date.UTC(year, (month ?? 1) - 1, day ?? 1) / 86_400_000 + 25_569
    })
    for (const row of grid) {
      const hour = /^(\d+):00$/.exec(String(row[0]))?.[1]
      if (hour !== undefined) row[0] = Number(hour) / 24
    }
    runScript(officeScript(MONTH, cells), grid)
    const bankingColumnOfDay3 = (grid[2] as Cell[]).indexOf('Banking', 1 + 2 * 3)
    const hour20Row = grid.find((row) => row[0] === 20 / 24) as Cell[]
    expect(hour20Row[bankingColumnOfDay3]).toBe(ownerByDay('2026-11-03'))
  })

  it('clears stale names in office hours but never touches "Expediente"', () => {
    const grid = emptySheet()
    const bankingColumnOfDay3 = (grid[2] as Cell[]).indexOf('Banking', 1 + 2 * 3)
    const hour10Row = grid.find((row) => row[0] === '10:00') as Cell[]
    hour10Row[bankingColumnOfDay3] = 'stale'
    hour10Row[bankingColumnOfDay3 + 1] = 'Expediente'
    runScript(officeScript(MONTH, cells), grid)
    expect(hour10Row[bankingColumnOfDay3]).toBe('')
    expect(hour10Row[bankingColumnOfDay3 + 1]).toBe('Expediente')
  })

  it('refuses a sheet of another month', () => {
    const otherMonth = parseCsv(buildSheet({ month: '2026-12', bankingAt: () => '' }))
    expect(() => runScript(officeScript(MONTH, cells), otherMonth)).toThrow(/Não achei as datas/)
  })
})

describe('pasteGrid', () => {
  it('keeps the layout with only the Banking cells filled', () => {
    const grid = pasteGrid(cells)
    expect(grid).toHaveLength(26)
    expect(grid[0]?.slice(0, 5)).toEqual(['Horário', '1/11/2026', '', '', '2/11/2026'])
    expect(grid[1]?.slice(1, 4)).toEqual(['Sustentação', 'Banking', 'Infra'])
    expect(grid[2]?.slice(1, 4)).toEqual(['', 'wren', ''])
  })

  it('reads back as the roster once the sheet marks its office hours', () => {
    const grid = pasteGrid(cells)
    const workdays = new Set(monthDays.filter((day) => day.kind === 'workday').map((day) => day.date))
    const dates = [...cells.keys()].sort()
    for (let hour = 9; hour < 18; hour++) {
      dates.forEach((date, index) => {
        if (workdays.has(date)) (grid[2 + hour] as string[])[1 + index * 3] = 'Expediente'
      })
    }
    expect(readSheetRoster(toCsv(grid)).days).toEqual(monthDays)
  })
})
