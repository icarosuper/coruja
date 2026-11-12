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

  it('refuses requests without a valid token', async () => {
    const client = clientFor(database.env)
    expect((await client.api.devs.$get()).status).toBe(401)
    expect((await client.api.devs.$get({}, asDev('coruja_wrong'))).status).toBe(401)
  })

  it('refuses a nickname that differs only in case', async () => {
    await addDevs(database.env, [{ nickname: 'Ícaro' }])
    const response = await clientFor(database.env).api.devs.$post(
      { json: { nickname: 'ícaro ', weight: 100 } },
      asTeam,
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'nickname_taken' })
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
})
