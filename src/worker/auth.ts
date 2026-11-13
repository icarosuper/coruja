import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './app-env'
import { createDatabase } from './db/client'
import { devs } from './db/schema'
import { ApiError } from './errors'

// Decisions #3: a personal token per dev (identity + auth) and a team password for admin actions.
// Tokens are random and long, so a plain SHA-256 is enough to store them; only the hash is kept.

const TOKEN_PREFIX = 'coruja_'
const TOKEN_BYTES = 32
const BEARER_PREFIX = 'Bearer '
export const TEAM_PASSWORD_HEADER = 'X-Team-Password'

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  const base64 = btoa(String.fromCharCode(...bytes))
  const base64Url = base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  return `${TOKEN_PREFIX}${base64Url}`
}

export async function hashToken(token: string): Promise<string> {
  const digest = await sha256(token)
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** Compares digests, so the time taken says nothing about the length or a common prefix. */
async function isSameSecret(given: string, expected: string): Promise<boolean> {
  const [givenDigest, expectedDigest] = await Promise.all([sha256(given), sha256(expected)])
  let difference = 0
  givenDigest.forEach((byte, index) => {
    difference |= byte ^ (expectedDigest[index] ?? 0)
  })
  return difference === 0
}

/** Identifies the calling dev by `Authorization: Bearer <token>`. Deactivated devs are refused. */
export const requireDev = createMiddleware<AppEnv>(async (context, next) => {
  const header = context.req.header('Authorization') ?? ''
  const token = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : ''
  if (!token) throw new ApiError(401, 'missing_token')

  const tokenHash = await hashToken(token)
  const database = createDatabase(context.env.DB)
  const dev = await database.query.devs.findFirst({ where: eq(devs.tokenHash, tokenHash) })
  const isActiveDev = dev?.active === true
  if (!isActiveDev) throw new ApiError(401, 'invalid_token')

  context.set('dev', { id: dev.id, nickname: dev.nickname })
  await next()
})

/** Admin actions: the shared team password in `X-Team-Password`. */
export const requireTeamPassword = createMiddleware<AppEnv>(async (context, next) => {
  const expected = context.env.TEAM_PASSWORD
  if (!expected) throw new ApiError(503, 'team_password_not_configured')
  const given = context.req.header(TEAM_PASSWORD_HEADER) ?? ''
  const isTeamPassword = await isSameSecret(given, expected)
  if (!isTeamPassword) throw new ApiError(401, 'invalid_team_password')
  await next()
})

/**
 * Either a dev token or the team password: for what the admin screen needs to read or set before any
 * dev has a token (the dev list, weights).
 */
export const requireDevOrTeamPassword = createMiddleware<AppEnv>(async (context, next) => {
  const hasTeamPassword = context.req.header(TEAM_PASSWORD_HEADER) !== undefined
  const middleware = hasTeamPassword ? requireTeamPassword : requireDev
  return middleware(context, next)
})
