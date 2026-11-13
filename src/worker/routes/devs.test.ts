import { describe, expect, it } from 'vitest'
import { addDevs, asDev, asTeam, clientFor } from '../testing/client'
import { useTestDatabase } from '../testing/env'

const database = useTestDatabase()
describe('devs', () => {
  it('adds a dev with the team password and returns a working token once', async () => {
    const client = clientFor(database.env)
    const response = await client.api.devs.$post({ json: { nickname: 'owl', weight: 100 } }, asTeam)
    expect(response.status).toBe(201)
    const { token, dev } = await response.json()
    expect(token).toMatch(/^coruja_[\w-]{43}$/)

    const listResponse = await client.api.devs.$get({}, asDev(token))
    expect(await listResponse.json()).toEqual([
      { id: dev.id, nickname: 'owl', weight: 100, active: true, hasToken: true, balance: 0 },
    ])
  })

  it('refuses admin actions without the right team password', async () => {
    const client = clientFor(database.env)
    const withoutPassword = await client.api.devs.$post({ json: { nickname: 'owl', weight: 100 } })
    const wrongPassword = await client.api.devs.$post(
      { json: { nickname: 'owl', weight: 100 } },
      { headers: { 'X-Team-Password': 'nope' } },
    )
    expect(withoutPassword.status).toBe(401)
    expect(wrongPassword.status).toBe(401)
    expect(await wrongPassword.json()).toEqual({ error: 'invalid_team_password' })
  })

  it('lists devs and sets weights with the team password, before anyone has a token', async () => {
    const devs = await addDevs(database.env, [{ nickname: 'owl' }])
    const client = clientFor(database.env)
    const param = { id: String(devs.get('owl')?.id) }
    expect((await client.api.devs[':id'].weight.$put({ param, json: { weight: 50 } }, asTeam)).status).toBe(
      200,
    )
    const listed = await (await client.api.devs.$get({}, asTeam)).json()
    expect(listed.map((dev) => dev.weight)).toEqual([50])
    const wrongPassword = { headers: { 'X-Team-Password': 'nope' } }
    expect((await client.api.devs.$get({}, wrongPassword)).status).toBe(401)
  })

  it('checks the team password', async () => {
    const client = clientFor(database.env)
    expect((await client.api.team.check.$get({}, asTeam)).status).toBe(200)
    expect((await client.api.team.check.$get({}, { headers: { 'X-Team-Password': 'nope' } })).status).toBe(
      401,
    )
  })

  it('refuses requests without a valid token', async () => {
    const client = clientFor(database.env)
    expect((await client.api.devs.$get()).status).toBe(401)
    expect((await client.api.devs.$get({}, asDev('coruja_wrong'))).status).toBe(401)
  })

  it('refuses a nickname that differs only in case', async () => {
    await addDevs(database.env, [{ nickname: 'Órion' }])
    const response = await clientFor(database.env).api.devs.$post(
      { json: { nickname: 'órion ', weight: 100 } },
      asTeam,
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'nickname_taken' })
  })

  it('refuses a nickname longer than a calendar cell fits', async () => {
    const response = await clientFor(database.env).api.devs.$post(
      { json: { nickname: 'a'.repeat(21), weight: 100 } },
      asTeam,
    )
    expect(response.status).toBe(400)
  })

  it('replaces a token: the old one stops working', async () => {
    const devs = await addDevs(database.env, [{ nickname: 'owl' }])
    const owl = devs.get('owl')
    if (!owl) throw new Error('missing dev')
    const client = clientFor(database.env)

    const response = await client.api.devs[':id'].token.$post({ param: { id: String(owl.id) } }, asTeam)
    const { token } = await response.json()
    expect((await client.api.devs.$get({}, asDev(owl.token))).status).toBe(401)
    expect((await client.api.devs.$get({}, asDev(token))).status).toBe(200)
  })

  it('lets any dev change a weight, and deactivating a dev revokes their access', async () => {
    const devs = await addDevs(database.env, [{ nickname: 'owl' }, { nickname: 'hawk' }])
    const owl = devs.get('owl')
    const hawk = devs.get('hawk')
    if (!owl || !hawk) throw new Error('missing dev')
    const client = clientFor(database.env)

    const weightResponse = await client.api.devs[':id'].weight.$put(
      { param: { id: String(hawk.id) }, json: { weight: 50 } },
      asDev(owl.token),
    )
    expect(weightResponse.status).toBe(200)

    await client.api.devs[':id'].$patch({ param: { id: String(hawk.id) }, json: { active: false } }, asTeam)
    const list = await (await client.api.devs.$get({}, asDev(owl.token))).json()
    expect(list.find((dev) => dev.id === hawk.id)).toMatchObject({ weight: 50, active: false })
    expect((await client.api.devs.$get({}, asDev(hawk.token))).status).toBe(401)
  })

  it('validates input', async () => {
    const response = await clientFor(database.env).api.devs.$post(
      { json: { nickname: ' ', weight: 101 } },
      asTeam,
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
  })

  it("edits someone else's profile with the team password only", async () => {
    const devs = await addDevs(database.env, [{ nickname: 'owl' }, { nickname: 'hawk' }])
    const owl = devs.get('owl') as { id: number; token: string }
    const hawk = devs.get('hawk') as { id: number; token: string }
    const client = clientFor(database.env)
    const owlParam = { id: String(owl.id) }

    const asOtherDev = await client.api.devs[':id'].rules.$put(
      { param: owlParam, json: { rules: [] } },
      asDev(hawk.token),
    )
    expect(asOtherDev.status).toBe(401)

    const rules = [{ kind: 'weekday' as const, value: 0, preference: 'cant' as const }]
    expect(
      (await client.api.devs[':id'].rules.$put({ param: owlParam, json: { rules } }, asTeam)).status,
    ).toBe(200)
    const added = await client.api.devs[':id'].absences.$post(
      { param: owlParam, json: { fromDate: '2026-12-01', toDate: '2026-12-05', note: null } },
      asTeam,
    )
    expect(added.status).toBe(201)
    const absence = await added.json()

    const profile = await (await client.api.devs[':id'].profile.$get({ param: owlParam }, asTeam)).json()
    expect(profile).toMatchObject({ dev: { nickname: 'owl' }, rules, absences: [absence] })
    const ownView = await (await client.api.me.$get({}, asDev(owl.token))).json()
    expect(ownView).toEqual(profile)

    const removed = await client.api.devs[':id'].absences[':absenceId'].$delete(
      { param: { ...owlParam, absenceId: String(absence.id) } },
      asTeam,
    )
    expect(removed.status).toBe(200)
    const missingDev = await client.api.devs[':id'].profile.$get({ param: { id: '999' } }, asTeam)
    expect(missingDev.status).toBe(404)
  })
})
