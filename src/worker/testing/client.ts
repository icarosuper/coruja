import { testClient } from 'hono/testing'
import { TEAM_PASSWORD_HEADER } from '../auth'
import type { Bindings } from '../bindings'
import { app } from '../index'
import { TEST_TEAM_PASSWORD } from './env'

// Test-only: the typed client (same types as the web app) bound to a test env.

export function clientFor(env: Bindings) {
  return testClient(app, env)
}

export const asTeam = { headers: { [TEAM_PASSWORD_HEADER]: TEST_TEAM_PASSWORD } }
export const asDev = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

/** Creates devs through the API and returns their ids and tokens, by nickname. */
export async function addDevs(env: Bindings, devs: Array<{ nickname: string; weight?: number }>) {
  const client = clientFor(env)
  const created = new Map<string, { id: number; token: string }>()
  for (const dev of devs) {
    const response = await client.api.devs.$post({ json: { weight: 100, ...dev } }, asTeam)
    if (response.status !== 201) throw new Error(`Could not create ${dev.nickname}: ${response.status}`)
    const body = await response.json()
    created.set(dev.nickname, { id: body.dev.id, token: body.token })
  }
  return created
}
