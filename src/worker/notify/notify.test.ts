import type { ExecutionContext } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saoPauloInstant } from '../../schedule/reminders'
import type { Bindings } from '../bindings'
import { createDatabase } from '../db/client'
import { addDevs, asDev, asTeam, clientFor } from '../testing/client'
import { TEST_APP_URL, useTestDatabase } from '../testing/env'
import { sendDueReminders } from './send'

const database = useTestDatabase()
const NTFY_URL = 'https://ntfy.test'
const withNtfy = (): Bindings => ({ ...database.env, NTFY_URL, NTFY_TOKEN: 'tk_test' })

type Published = { topic: string; title: string; message: string; click?: string }
let published: Published[]
let ntfyAnswers: number
const realFetch = globalThis.fetch

beforeEach(() => {
  published = []
  ntfyAnswers = 200
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const isNtfy = url.startsWith(NTFY_URL)
    if (!isNtfy) return realFetch(input, init)
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tk_test')
    published.push(JSON.parse(String(init?.body)))
    return new Response('{}', { status: ntfyAnswers })
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Collects what routes send after answering, to wait for it. */
function background() {
  const tasks: Promise<unknown>[] = []
  const executionCtx: ExecutionContext = {
    waitUntil: (task) => tasks.push(task),
    passThroughOnException: () => {},
    props: {},
  }
  return { executionCtx, settled: () => Promise.all(tasks) }
}

describe('the profile’s notifications', () => {
  it('has the defaults and no subscription until ntfy is configured', async () => {
    const owl = (await addDevs(database.env, [{ nickname: 'owl' }])).get('owl')
    const answer = await (
      await clientFor(database.env).api.me.notifications.$get({}, asDev(owl?.token ?? ''))
    ).json()
    expect(answer.subscription).toBeNull()
    expect(answer.settings).toMatchObject({ eveEnabled: true, eveTime: '18:00', shiftChangedEnabled: true })
  })

  it('names the topic after the nickname and links to it', async () => {
    const orion = (await addDevs(database.env, [{ nickname: 'Órion Jr' }])).get('Órion Jr')
    const answer = await (
      await clientFor(withNtfy()).api.me.notifications.$get({}, asDev(orion?.token ?? ''))
    ).json()
    expect(answer.subscription).toEqual({
      topic: 'coruja-orion-jr',
      webUrl: 'https://ntfy.test/coruja-orion-jr',
      appUrl: 'ntfy://ntfy.test/coruja-orion-jr?display=Coruja',
    })
  })

  it('saves the settings, refusing a time that is not HH:MM', async () => {
    const owl = (await addDevs(database.env, [{ nickname: 'owl' }])).get('owl')
    const client = clientFor(database.env)
    const settings = {
      eveEnabled: false,
      eveTime: '20:30',
      dayEnabled: true,
      dayTime: '07:15',
      shiftStartEnabled: true,
      shiftChangedEnabled: false,
      monthOpenedEnabled: true,
    }
    const saved = await client.api.me.notifications.$put({ json: settings }, asDev(owl?.token ?? ''))
    const invalid = await client.api.me.notifications.$put(
      { json: { ...settings, dayTime: '24:00' } },
      asDev(owl?.token ?? ''),
    )
    expect(saved.status).toBe(200)
    expect(invalid.status).toBe(400)
    const answer = await (await client.api.me.notifications.$get({}, asDev(owl?.token ?? ''))).json()
    expect(answer.settings).toEqual(settings)
  })

  it('lets the admin read and change someone else’s', async () => {
    const owl = (await addDevs(database.env, [{ nickname: 'owl' }])).get('owl')
    const client = clientFor(withNtfy())
    const param = { id: String(owl?.id) }
    const answer = await (await client.api.devs[':id'].notifications.$get({ param }, asTeam)).json()
    expect(answer.subscription?.topic).toBe('coruja-owl')
    const test = await client.api.devs[':id'].notifications.test.$post({ param }, asTeam)
    expect(test.status).toBe(200)
    expect(published).toEqual([expect.objectContaining({ topic: 'coruja-owl', title: 'Coruja' })])
  })

  it('sends a test, or says why it could not', async () => {
    const owl = (await addDevs(database.env, [{ nickname: 'owl' }])).get('owl')
    const send = (env: Bindings) =>
      clientFor(env).api.me.notifications.test.$post({}, asDev(owl?.token ?? ''))
    expect((await send(withNtfy())).status).toBe(200)
    expect(await (await send(database.env)).json()).toEqual({ error: 'ntfy_not_configured' })
    ntfyAnswers = 403
    expect(await (await send(withNtfy())).json()).toEqual({ error: 'ntfy_failed' })
  })

  it('refuses a nickname that would share a topic', async () => {
    await addDevs(database.env, [{ nickname: 'Órion' }])
    const taken = await clientFor(database.env).api.devs.$post(
      { json: { nickname: 'orion', weight: 100 } },
      asTeam,
    )
    expect(await taken.json()).toEqual({ error: 'nickname_taken' })
  })
})

describe('notifications about the roster', () => {
  const DECEMBER = '2026-12'
  let devs: Map<string, { id: number; token: string }>
  const idOf = (nickname: string) => devs.get(nickname)?.id ?? 0
  const tokenOf = (nickname: string) => devs.get(nickname)?.token ?? ''

  beforeEach(async () => {
    // Shifts that are over are left out of "your shift changed": December must still be ahead.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'))
    devs = await addDevs(database.env, [{ nickname: 'owl' }, { nickname: 'hawk' }])
    const opened = await clientFor(database.env).api.months[':month'].open.$post(
      { param: { month: DECEMBER } },
      asDev(tokenOf('owl')),
    )
    expect(opened.status).toBe(201)
  })

  /** Puts `nickname` on the whole shift of `date` and waits for the notifications it sends. */
  async function assign(date: string, nickname: string, by: string) {
    const segments = [{ devId: idOf(nickname), fromHour: 0, toHour: 15 }]
    const tasks = background()
    const answer = await clientFor(withNtfy(), tasks.executionCtx).api.months[':month'].days[':date'].$put(
      { param: { month: DECEMBER, date }, json: { kind: 'workday', segments } },
      asDev(tokenOf(by)),
    )
    await tasks.settled()
    expect(answer.status).toBe(200)
    return answer.json()
  }

  it('reminds on the eve once, and again after a failed send', async () => {
    await assign('2026-12-10', 'hawk', 'owl')
    published = []
    const notify = {
      database: createDatabase(database.env.DB),
      ntfy: { serverUrl: NTFY_URL, token: 'tk_test' },
      appUrl: TEST_APP_URL,
    }
    const eve = new Date(saoPauloInstant('2026-12-09', '18:00'))

    ntfyAnswers = 500
    await sendDueReminders(notify, eve)
    ntfyAnswers = 200
    await sendDueReminders(notify, new Date(eve.getTime() + 60_000))
    await sendDueReminders(notify, new Date(eve.getTime() + 120_000))

    const toHawk = published.filter(
      (message) => message.topic === 'coruja-hawk' && message.title === 'Sobreaviso amanhã',
    )
    expect(toHawk).toHaveLength(2) // the failed one, then the retry
    expect(toHawk[1]).toEqual({
      topic: 'coruja-hawk',
      title: 'Sobreaviso amanhã',
      message: 'qui 10/12: 18:00 → 09:00 (15h)',
      click: `${TEST_APP_URL}/#/mes/2026-12`,
      tags: ['owl'],
    })
  })

  it('tells the devs whose shift changed, not the one who changed it', async () => {
    await assign('2026-12-10', 'owl', 'owl')
    published = []
    const answer = await assign('2026-12-10', 'hawk', 'owl')

    expect(answer).not.toHaveProperty('changedDays')
    expect(published).toEqual([
      expect.objectContaining({
        topic: 'coruja-hawk',
        title: 'Sua escala mudou',
        message: 'qui 10/12: 18:00 → 09:00 (15h)\nMudança feita por owl.',
      }),
    ])
  })

  it('tells a dev who left a shift, when they want it', async () => {
    await assign('2026-12-10', 'hawk', 'owl')
    published = []
    await assign('2026-12-10', 'owl', 'owl')
    expect(published).toEqual([
      expect.objectContaining({
        topic: 'coruja-hawk',
        message: 'qui 10/12: você saiu da escala\nMudança feita por owl.',
      }),
    ])
  })

  it('tells the other participants a month was generated again, if they asked for it', async () => {
    const client = clientFor(withNtfy())
    await client.api.me.notifications.$put(
      {
        json: {
          eveEnabled: true,
          eveTime: '18:00',
          dayEnabled: false,
          dayTime: '09:00',
          shiftStartEnabled: false,
          shiftChangedEnabled: true,
          monthOpenedEnabled: true,
        },
      },
      asDev(tokenOf('hawk')),
    )
    const tasks = background()
    const regenerated = await clientFor(withNtfy(), tasks.executionCtx).api.months[':month'].regenerate.$post(
      { param: { month: DECEMBER } },
      asDev(tokenOf('owl')),
    )
    await tasks.settled()
    expect(regenerated.status).toBe(200)
    expect(published).toEqual([
      expect.objectContaining({ topic: 'coruja-hawk', title: 'Escala de dezembro gerada de novo' }),
    ])
  })
})
