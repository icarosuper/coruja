import { beforeEach, describe, expect, it } from 'vitest'
import { saoPauloDate } from '../../schedule/calendar'
import { type IsoDate, monthOf } from '../../schedule/dates'
import { bankingByShift, buildSheet } from '../../sheet/testing/build-sheet'
import { addDevs, asDev, asTeam, clientFor } from '../testing/client'
import { useTestDatabase } from '../testing/env'

const database = useTestDatabase()
let devs: Map<string, { id: number; token: string }>
beforeEach(async () => {
  devs = await addDevs(database.env, [
    { nickname: 'owl' },
    { nickname: 'hawk' },
    { nickname: 'kite' },
    { nickname: 'wren' },
  ])
})

const DECEMBER = '2026-12'
const JANUARY = '2027-01'
const devOf = (nickname: string) => {
  const dev = devs.get(nickname)
  if (!dev) throw new Error(`No dev ${nickname}`)
  return dev
}
const as = (nickname: string) => asDev(devOf(nickname).token)

async function openMonth(month: string, by = 'owl') {
  const response = await clientFor(database.env).api.months[':month'].open.$post({ param: { month } }, as(by))
  expect(response.status).toBe(201)
  return response.json()
}

async function viewMonth(month: string) {
  return (await clientFor(database.env).api.months[':month'].$get({ param: { month } }, as('owl'))).json()
}

async function editDay(
  month: string,
  date: IsoDate,
  body: { kind: 'workday' | 'day_off'; devIds: number[] },
) {
  const length = body.kind === 'workday' ? 15 : 24
  const hoursEach = Math.floor(length / body.devIds.length)
  const segments = body.devIds.map((devId, index) => ({
    devId,
    fromHour: index * hoursEach,
    toHour: index === body.devIds.length - 1 ? length : (index + 1) * hoursEach,
  }))
  return clientFor(database.env).api.months[':month'].days[':date'].$put(
    { param: { month, date }, json: { kind: body.kind, segments } },
    as('owl'),
  )
}

async function exportAs(nickname: string, month: string, format: 'office_script' | 'paste_grid') {
  return clientFor(database.env).api.months[':month'].export.$post(
    { param: { month }, json: { format } },
    as(nickname),
  )
}

async function confirm(month: string, nickname: string) {
  return clientFor(database.env).api.months[':month'].confirm.$post({ param: { month } }, as(nickname))
}

describe('opening a month', () => {
  it('suggests a roster for every day and waits for every participant', async () => {
    const month = await openMonth(DECEMBER)
    expect(month.exported).toBeNull()
    expect(month.days).toHaveLength(31)
    expect(month.unassignedDates).toEqual([])
    expect(month.days.find((day) => day.date === '2026-12-25')).toMatchObject({
      kind: 'day_off',
      holidayName: expect.any(String),
    })
    expect(month.participants.map((participant) => participant.nickname)).toEqual([
      'hawk',
      'kite',
      'owl',
      'wren',
    ])
    expect(month.pendingDevIds).toHaveLength(4)
    expect(month.isReady).toBe(false)

    const totalHours = month.participants.reduce((sum, participant) => sum + participant.hours, 0)
    for (const participant of month.participants) {
      expect(participant.expectedHours).toBeCloseTo(totalHours / 4)
      expect(participant.balanceAfter).toBeCloseTo(participant.hours - participant.expectedHours)
    }
  })

  it('respects cant rules and leaves out devs with weight 0', async () => {
    const client = clientFor(database.env)
    const everySunday = { kind: 'weekday', value: 0, preference: 'cant' } as const
    await client.api.me.rules.$put({ json: { rules: [everySunday] } }, as('hawk'))
    await client.api.devs[':id'].weight.$put(
      { param: { id: String(devOf('wren').id) }, json: { weight: 0 } },
      as('owl'),
    )
    const month = await openMonth(DECEMBER)
    const sundays = month.days.filter((day) => new Date(`${day.date}T00:00Z`).getUTCDay() === 0)
    expect(sundays.flatMap((day) => day.segments.map((segment) => segment.nickname))).not.toContain('hawk')
    expect(month.participants.map((participant) => participant.nickname)).not.toContain('wren')
  })

  it("lists each active dev's preferences for the month's dates", async () => {
    const client = clientFor(database.env)
    const saturdays = { kind: 'weekday', value: 6, preference: 'good' } as const
    await client.api.me.rules.$put({ json: { rules: [saturdays] } }, as('kite'))
    await client.api.me.absences.$put(
      { json: { fromDate: '2026-12-26', toDate: '2027-01-02', absent: true } },
      as('kite'),
    )
    const month = await openMonth(DECEMBER)
    const kite = month.preferences.find((entry) => entry.devId === devOf('kite').id)
    const absentDays = ['26', '27', '28', '29', '30', '31'].map((day) => [`2026-12-${day}`, 'cant'])
    const goodSaturdays = ['05', '12', '19'].map((day) => [`2026-12-${day}`, 'good'])
    expect(kite?.byDate).toEqual(Object.fromEntries([...goodSaturdays, ...absentDays]))
    expect(month.preferences.find((entry) => entry.devId === devOf('owl').id)?.byDate).toEqual({})
  })

  it('refuses a month that exists or comes before an existing one', async () => {
    await openMonth(DECEMBER)
    const client = clientFor(database.env)
    const again = await client.api.months[':month'].open.$post({ param: { month: DECEMBER } }, as('owl'))
    const earlier = await client.api.months[':month'].open.$post({ param: { month: '2026-11' } }, as('owl'))
    expect(await again.json()).toEqual({ error: 'month_exists' })
    expect(await earlier.json()).toEqual({ error: 'later_month_exists' })
  })

  it('carries the balance into the next month and counts the shift that runs into day 1', async () => {
    const december = await openMonth(DECEMBER)
    const january = await openMonth(JANUARY)
    for (const participant of january.participants) {
      const inDecember = december.participants.find((previous) => previous.devId === participant.devId)
      expect(participant.balanceBefore).toBeCloseTo(inDecember?.balanceAfter ?? Number.NaN)
    }
    const december31Owner = december.days.at(-1)?.segments[0]?.devId
    expect(january.previousDay?.segments[0]?.devId).toBe(december31Owner)
    expect(january.days[0]?.segments[0]?.devId).not.toBe(december31Owner)
  })
})

describe('editing, confirming and closing', () => {
  it('unconfirms only the devs whose hours changed, and logs the edit', async () => {
    const month = await openMonth(DECEMBER)
    for (const nickname of devs.keys()) await confirm(DECEMBER, nickname)
    expect((await viewMonth(DECEMBER)).isReady).toBe(true)

    const day = month.days.find((candidate) => candidate.kind === 'workday')
    const previousOwner = day?.segments[0]?.devId
    const newOwner = [...devs.values()].find((dev) => dev.id !== previousOwner)?.id ?? 0
    const response = await editDay(DECEMBER, day?.date ?? '', { kind: 'workday', devIds: [newOwner] })
    expect(await response.json()).toEqual({
      changedDates: [day?.date],
      devsToReconfirm: [previousOwner, newOwner].sort((first, second) => (first ?? 0) - (second ?? 0)),
    })

    const after = await viewMonth(DECEMBER)
    expect(after.isReady).toBe(false)
    expect(after.pendingDevIds.sort()).toEqual([previousOwner, newOwner].sort())
    const log = await (
      await clientFor(database.env).api.months[':month'].log.$get({ param: { month: DECEMBER } }, as('owl'))
    ).json()
    expect(log[0]).toMatchObject({ action: 'assign', date: day?.date, actorNickname: 'owl' })
  })

  it('splits a shift and flips a day kind', async () => {
    await openMonth(DECEMBER)
    const owl = devOf('owl').id
    const hawk = devOf('hawk').id
    const split = await editDay(DECEMBER, '2026-12-01', { kind: 'workday', devIds: [owl, hawk] })
    expect(split.status).toBe(200)
    const flipped = await editDay(DECEMBER, '2026-12-24', { kind: 'day_off', devIds: [owl] })
    expect(flipped.status).toBe(200)

    const month = await viewMonth(DECEMBER)
    expect(month.days.find((day) => day.date === '2026-12-01')?.segments).toHaveLength(2)
    expect(month.days.find((day) => day.date === '2026-12-24')?.kind).toBe('day_off')
    const log = await (
      await clientFor(database.env).api.months[':month'].log.$get({ param: { month: DECEMBER } }, as('owl'))
    ).json()
    expect(log.slice(0, 2).map((entry) => entry.action)).toEqual(['day_kind', 'split'])
  })

  it('refuses segments that do not cover the shift', async () => {
    await openMonth(DECEMBER)
    const gap = await clientFor(database.env).api.months[':month'].days[':date'].$put(
      {
        param: { month: DECEMBER, date: '2026-12-01' },
        json: { kind: 'workday', segments: [{ devId: devOf('owl').id, fromHour: 0, toHour: 10 }] },
      },
      as('owl'),
    )
    expect(await gap.json()).toEqual({ error: 'invalid_segments', date: '2026-12-01', problem: 'gap' })
    const unknownDev = await editDay(DECEMBER, '2026-12-01', { kind: 'workday', devIds: [999] })
    expect(await unknownDev.json()).toMatchObject({ error: 'unknown_dev' })
  })

  it('takes a dev who joined after the month opened, with an expected share of zero', async () => {
    await openMonth(DECEMBER)
    const lark = (await addDevs(database.env, [{ nickname: 'lark' }])).get('lark')
    const response = await editDay(DECEMBER, '2026-12-01', { kind: 'workday', devIds: [lark?.id ?? 0] })
    expect(response.status).toBe(200)

    const month = await viewMonth(DECEMBER)
    expect(month.participants.map((participant) => participant.nickname)).not.toContain('lark')
    expect(month.outsiders).toEqual([
      { devId: lark?.id, nickname: 'lark', hours: 15, balanceBefore: 0, balanceAfter: 15 },
    ])
  })

  it('takes back a confirmation and logs it', async () => {
    await openMonth(DECEMBER)
    await confirm(DECEMBER, 'kite')
    const client = clientFor(database.env)
    const response = await client.api.months[':month'].confirm.$delete(
      { param: { month: DECEMBER } },
      as('kite'),
    )
    expect(response.status).toBe(200)
    expect((await viewMonth(DECEMBER)).pendingDevIds).toContain(devOf('kite').id)
    const log = await (
      await client.api.months[':month'].log.$get({ param: { month: DECEMBER } }, as('owl'))
    ).json()
    expect(log.slice(0, 2).map((entry) => entry.action)).toEqual(['unconfirm', 'confirm'])
  })

  it('exports with pending confirmations; after it, edits record swaps without unconfirming', async () => {
    const month = await openMonth(DECEMBER)
    await confirm(DECEMBER, 'owl')
    const exported = await exportAs('hawk', DECEMBER, 'office_script')
    expect(exported.status).toBe(200)
    const body = await exported.json()
    expect(body.script).toContain('function main(workbook: ExcelScript.Workbook)')
    expect(body.script).toContain('"2026-12-31"')
    expect((await confirm(DECEMBER, 'kite')).status).toBe(409)

    const owlDay = month.days.find(
      (day) => day.segments[0]?.devId !== devOf('owl').id && day.kind === 'workday',
    )
    await editDay(DECEMBER, owlDay?.date ?? '', { kind: 'workday', devIds: [devOf('owl').id] })
    const after = await viewMonth(DECEMBER)
    expect(after.exported).toMatchObject({ byNickname: 'hawk', changesAfter: 1 })
    expect(after.participants.find((participant) => participant.nickname === 'owl')?.confirmed).toBe(true)

    await exportAs('owl', DECEMBER, 'paste_grid')
    expect((await viewMonth(DECEMBER)).exported).toMatchObject({ byNickname: 'owl', changesAfter: 0 })
  })

  it('refuses to export a month with a day nobody took', async () => {
    const month = await openMonth(DECEMBER)
    const someDate = month.days[3]?.date ?? ''
    await clientFor(database.env).api.months[':month'].days[':date'].$put(
      { param: { month: DECEMBER, date: someDate }, json: { kind: 'workday', segments: [] } },
      as('owl'),
    )
    const response = await exportAs('owl', DECEMBER, 'paste_grid')
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'unassigned_days', dates: [someDate] })
  })
})

describe('generating the roster again', () => {
  const regenerate = (month: string, by = 'hawk') =>
    clientFor(database.env).api.months[':month'].regenerate.$post({ param: { month } }, as(by))

  it('suggests again from the profiles as they are now, keeping day kinds and dropping confirmations', async () => {
    await openMonth(DECEMBER)
    await clientFor(database.env).api.months[':month'].confirm.$post(
      { param: { month: DECEMBER } },
      as('kite'),
    )
    expect(
      (await editDay(DECEMBER, '2026-12-10', { kind: 'day_off', devIds: [devOf('owl').id] })).status,
    ).toBe(200)
    await clientFor(database.env).api.me.absences.$put(
      { json: { fromDate: '2026-12-01', toDate: '2026-12-31', absent: true } },
      as('owl'),
    )
    expect((await viewMonth(DECEMBER)).editsAfterSuggestion).toEqual({ dates: 1, byNicknames: ['owl'] })

    const response = await regenerate(DECEMBER)
    expect(response.status).toBe(200)
    const view = await response.json()
    const owlHasShifts = view.days.some((day) =>
      day.segments.some((segment) => segment.devId === devOf('owl').id),
    )
    expect(owlHasShifts).toBe(false)
    expect(view.days.find((day) => day.date === '2026-12-10')?.kind).toBe('day_off')
    expect(view.participants.every((participant) => !participant.confirmed)).toBe(true)
    expect(view.editsAfterSuggestion).toEqual({ dates: 0, byNicknames: [] })

    const log = await (
      await clientFor(database.env).api.months[':month'].log.$get({ param: { month: DECEMBER } }, as('owl'))
    ).json()
    expect(log[0]).toMatchObject({ action: 'regenerate', actorNickname: 'hawk' })
  })

  it('is refused once the month is exported', async () => {
    await openMonth(DECEMBER)
    expect((await exportAs('owl', DECEMBER, 'paste_grid')).status).toBe(200)
    const response = await regenerate(DECEMBER)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'month_exported' })
  })

  it('is refused once a later month is open', async () => {
    await openMonth(DECEMBER)
    await openMonth(JANUARY)
    const response = await regenerate(DECEMBER)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'later_month_exists' })
  })
})

describe('closing a month (undoing the opening)', () => {
  // Far enough ahead that the months have not started whenever the tests run.
  const FUTURE = '2099-01'
  const AFTER_FUTURE = '2099-02'
  const close = (month: string) =>
    clientFor(database.env).api.months[':month'].$delete({ param: { month } }, as('hawk'))

  it('removes the month, its roster and confirmations, and lets it open again', async () => {
    await openMonth(FUTURE)
    await confirm(FUTURE, 'owl')
    const response = await close(FUTURE)
    expect(response.status).toBe(200)
    const afterClosing = await clientFor(database.env).api.months[':month'].$get(
      { param: { month: FUTURE } },
      as('owl'),
    )
    expect(afterClosing.status).toBe(404)

    const reopened = await openMonth(FUTURE)
    expect(reopened.participants.every((participant) => !participant.confirmed)).toBe(true)
  })

  it('is refused once the month has started', async () => {
    const thisMonth = monthOf(saoPauloDate(new Date()))
    await openMonth(thisMonth)
    const response = await close(thisMonth)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'month_started' })
  })

  it('works on an exported month too', async () => {
    await openMonth(FUTURE)
    expect((await exportAs('owl', FUTURE, 'paste_grid')).status).toBe(200)
    expect((await close(FUTURE)).status).toBe(200)
  })

  it('is refused while a later month exists', async () => {
    await openMonth(FUTURE)
    await openMonth(AFTER_FUTURE)
    const response = await close(FUTURE)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'later_month_exists' })
  })
})

describe('the sheet', () => {
  const rotation = ['owl', 'hawk', 'kite', 'wren']
  const ownerOf = (shiftDate: IsoDate) => {
    const dayNumber = Number(shiftDate.slice(8))
    return shiftDate < '2026-11-01' ? 'kite' : (rotation[dayNumber % rotation.length] ?? '')
  }
  const novemberCsv = buildSheet({ month: '2026-11', bankingAt: bankingByShift(ownerOf) })

  it('imports a month as exported and turns the previous month hours into adjustments', async () => {
    const response = await clientFor(database.env).api.months.import.$post(
      { json: { csv: novemberCsv } },
      asTeam,
    )
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ month: '2026-11', participantCount: 4, unassignedDates: [] })

    const november = await viewMonth('2026-11')
    expect(november.exported).toMatchObject({ byNickname: null, changesAfter: 0 })
    const sheetHours = november.participants.reduce((sum, participant) => sum + participant.hours, 0)
    expect(sheetHours).toBe(549 - 9)
    const balances = november.participants.map((participant) => participant.balanceAfter)
    expect(balances.reduce((sum, balance) => sum + balance, 0)).toBeCloseTo(0)

    // kite's 9h of Nov 1 count as if the Oct 31 shift were in the app.
    const kite = november.participants.find((participant) => participant.nickname === 'kite')
    const expectedShare = 549 / 4
    expect(kite?.balanceAfter).toBeCloseTo((kite?.hours ?? 0) + 9 - expectedShare)
  })

  it('refuses a sheet with nicknames that are not devs', async () => {
    const csv = buildSheet({ month: '2026-11', bankingAt: bankingByShift(() => 'ghost') })
    const response = await clientFor(database.env).api.months.import.$post({ json: { csv } }, asTeam)
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'unknown_nicknames', nicknames: ['ghost'] })
  })

  it('shows what the sheet changed and applies it as a sync', async () => {
    const month = await openMonth(DECEMBER)
    const swappedDate = month.days.find((day) => day.kind === 'workday')?.date ?? ''
    const ownerInApp = (date: IsoDate) => {
      const day = month.days.find((candidate) => candidate.date === date)
      return day?.segments[0]?.nickname ?? ''
    }
    const swappedOwner = rotation.find((nickname) => nickname !== ownerInApp(swappedDate)) ?? ''
    const sheetOwner = (shiftDate: IsoDate) => {
      if (shiftDate < '2026-12-01') return 'kite'
      return shiftDate === swappedDate ? swappedOwner : ownerInApp(shiftDate)
    }
    const csv = buildSheet({ month: DECEMBER, bankingAt: bankingByShift(sheetOwner) })
    const client = clientFor(database.env)

    const diff = await (
      await client.api.months[':month']['sheet-diff'].$post(
        { param: { month: DECEMBER }, json: { csv } },
        as('owl'),
      )
    ).json()
    expect(diff.differences).toEqual([
      {
        date: swappedDate,
        before: {
          kind: 'workday',
          segments: [{ devId: devOf(ownerInApp(swappedDate)).id, fromHour: 0, toHour: 15 }],
        },
        after: { kind: 'workday', segments: [{ devId: devOf(swappedOwner).id, fromHour: 0, toHour: 15 }] },
      },
    ])

    const changes = diff.differences.map((difference) => ({ date: difference.date, ...difference.after }))
    const applied = await client.api.months[':month'].changes.$post(
      { param: { month: DECEMBER }, json: { changes } },
      as('owl'),
    )
    expect((await applied.json()).changedDates).toEqual([swappedDate])
    const log = await (
      await client.api.months[':month'].log.$get({ param: { month: DECEMBER } }, as('owl'))
    ).json()
    expect(log[0]?.action).toBe('sync')

    const diffAgain = await (
      await client.api.months[':month']['sheet-diff'].$post(
        { param: { month: DECEMBER }, json: { csv } },
        as('owl'),
      )
    ).json()
    expect(diffAgain.differences).toEqual([])
  })
})
