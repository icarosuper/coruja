// Who is using the app. The personal token stays in this browser (localStorage) until "sair"; the
// team password only for this tab (sessionStorage), so admin access does not linger.

import { forgetAnswers } from './cache.svelte'

const TOKEN_KEY = 'coruja-token'
const TEAM_PASSWORD_KEY = 'coruja-team-password'

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    // Private mode or blocked storage: the session lasts until the page reloads.
  }
}

export const session = $state({
  token: read(() => localStorage, TOKEN_KEY),
  teamPassword: read(() => sessionStorage, TEAM_PASSWORD_KEY),
  /** The signed-in dev, once `GET /me` answered. */
  me: null as { id: number; nickname: string } | null,
})

export function signIn(token: string, me: { id: number; nickname: string }) {
  session.token = token
  session.me = me
  write(() => localStorage, TOKEN_KEY, token)
}

export function signOut() {
  session.token = null
  session.me = null
  write(() => localStorage, TOKEN_KEY, null)
  forgetAnswers()
}

export function unlockAdmin(teamPassword: string) {
  session.teamPassword = teamPassword
  write(() => sessionStorage, TEAM_PASSWORD_KEY, teamPassword)
}

export function lockAdmin() {
  session.teamPassword = null
  write(() => sessionStorage, TEAM_PASSWORD_KEY, null)
  forgetAnswers()
}
