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
      { kind: 'month_day', value: 5, preference: 'avoid' },
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

  it('adds and removes absences', async () => {
    const client = clientFor(database.env)
    const response = await client.api.me.absences.$post(
      { json: { fromDate: '2026-12-20', toDate: '2026-12-31', note: 'férias' } },
      asDev(token),
    )
    expect(response.status).toBe(201)
    const absence = await response.json()
    expect((await (await client.api.me.$get({}, asDev(token))).json()).absences).toEqual([absence])

    const removal = await client.api.me.absences[':id'].$delete(
      { param: { id: String(absence.id) } },
      asDev(token),
    )
    expect(removal.status).toBe(200)
    expect((await (await client.api.me.$get({}, asDev(token))).json()).absences).toEqual([])
  })

  it('merges an absence that overlaps or touches others into one', async () => {
    const client = clientFor(database.env)
    const add = (fromDate: string, toDate: string, note: string | null = null) =>
      client.api.me.absences.$post({ json: { fromDate, toDate, note } }, asDev(token))
    await add('2026-12-03', '2026-12-05', 'médico')
    await add('2026-12-03', '2026-12-05')
    await add('2026-12-10', '2026-12-12')
    await add('2026-12-20', '2026-12-22')
    const merged = await (await add('2026-12-01', '2026-12-09', 'viagem')).json()

    expect(merged).toMatchObject({ fromDate: '2026-12-01', toDate: '2026-12-12', note: 'médico; viagem' })
    const { absences } = await (await client.api.me.$get({}, asDev(token))).json()
    expect(absences.map((absence) => [absence.fromDate, absence.toDate])).toEqual([
      ['2026-12-01', '2026-12-12'],
      ['2026-12-20', '2026-12-22'],
    ])
  })

  it('refuses an absence that ends before it starts', async () => {
    const response = await clientFor(database.env).api.me.absences.$post(
      { json: { fromDate: '2026-12-20', toDate: '2026-12-10' } },
      asDev(token),
    )
    expect(response.status).toBe(422)
  })
})
