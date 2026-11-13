import { hc } from 'hono/client'
import type { AppType } from '../worker/index'
import { messageOf } from './errors'
import { session, signOut } from './session.svelte'

// Typed from the Worker's routes: no request/response types are declared on the web side.
export const api = hc<AppType>('/', {
  headers: (): Record<string, string> => (session.token ? { Authorization: `Bearer ${session.token}` } : {}),
})

/** Options for admin calls: the team password typed on the admin screen (`TEAM_PASSWORD_HEADER`). */
export const asTeam = () => ({ headers: { 'X-Team-Password': session.teamPassword ?? '' } })

/** A refused call: `code` is the API's English code, `message` the Portuguese text to show. */
export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown>,
  ) {
    super(messageOf(code, details))
    this.name = 'ApiFailure'
  }
}

type Response = { ok: boolean; status: number; json(): Promise<unknown> }

/** Awaits a typed call and returns its body, or throws `ApiFailure`. A rejected token signs out. */
export async function call<Answer extends Response>(
  request: Promise<Answer>,
): Promise<Awaited<ReturnType<Answer['json']>>> {
  let response: Answer
  try {
    response = await request
  } catch {
    throw new ApiFailure('network_error', {})
  }
  if (response.ok) return (await response.json()) as Awaited<ReturnType<Answer['json']>>

  const body = (await response.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>
  const code = body.error ?? 'internal_error'
  const isTokenRefused = code === 'invalid_token' || code === 'missing_token'
  if (isTokenRefused) signOut()
  throw new ApiFailure(code, body)
}
