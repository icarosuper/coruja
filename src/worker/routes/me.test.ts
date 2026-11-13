import { beforeEach, describe, expect, it } from 'vitest'
import { addDevs, asDev, clientFor } from '../testing/client'
import { useTestDatabase } from '../testing/env'

const database = useTestDatabase()
let token: string
beforeEach(async () => {
  token = (await addDevs(database.env, [{ nickname: 'owl' }])).get('owl')?.token ?? ''
})

describe('profile', () => {
  it('replaces the rules', async () => {
    const client = clientFor(database.env)
    const rules = [
      { kind: 'weekday', value: 0, preference: 'cant' },
      { kind: 'weekday', value: 5, preference: 'avoid' },
    ] as const
    expect((await client.api.me.rules.$put({ json: { rules: [...rules] } }, asDev(token))).status).toBe(200)
    await client.api.me.rules.$put({ json: { rules: [rules[1]] } }, asDev(token))

    const profile = await (await client.api.me.$get({}, asDev(token))).json()
    expect(profile.dev.nickname).toBe('owl')
    expect(profile.rules).toEqual([rules[1]])
  })

  it('refuses a rule out of range or two rules for the same day', async () => {
    const client = clientFor(database.env)
    const outOfRange = await client.api.me.rules.$put(
      { json: { rules: [{ kind: 'weekday', value: 7, preference: 'good' }] } },
      asDev(token),
    )
    const repeated = await client.api.me.rules.$put(
      {
        json: {
          rules: [
            { kind: 'weekday', value: 1, preference: 'good' },
            { kind: 'weekday', value: 1, preference: 'cant' },
          ],
        },
      },
      asDev(token),
    )
    expect(outOfRange.status).toBe(400)
    expect(await repeated.json()).toEqual({ error: 'repeated_rule' })
  })

  it('marks and clears days, keeping the periods merged', async () => {
    const client = clientFor(database.env)
    const setDays = (fromDate: string, toDate: string, absent: boolean) =>
      client.api.me.absences.$put({ json: { fromDate, toDate, absent } }, asDev(token))
    await setDays('2026-12-10', '2026-12-10', true)
    await setDays('2026-12-01', '2026-12-05', true)
    const answer = await setDays('2026-12-06', '2026-12-09', true)
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual([{ fromDate: '2026-12-01', toDate: '2026-12-10' }])

    await setDays('2026-12-04', '2026-12-04', false)
    const { absences, rosterMonths } = await (await client.api.me.$get({}, asDev(token))).json()
    expect(absences).toEqual([
      { fromDate: '2026-12-01', toDate: '2026-12-03' },
      { fromDate: '2026-12-05', toDate: '2026-12-10' },
    ])
    expect(rosterMonths).toEqual([])
  })

  it('refuses a range that ends before it starts or spans more than a year', async () => {
    const client = clientFor(database.env)
    const setDays = (fromDate: string, toDate: string) =>
      client.api.me.absences.$put({ json: { fromDate, toDate, absent: true } }, asDev(token))
    expect((await setDays('2026-12-20', '2026-12-10')).status).toBe(400)
    expect((await setDays('2026-12-01', '2028-01-01')).status).toBe(400)
  })
})
