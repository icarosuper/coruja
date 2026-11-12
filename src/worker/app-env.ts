import type { Bindings } from './bindings'

/** The dev identified by the request's token (set by `requireDev`). */
export type CurrentDev = { id: number; nickname: string }

export type AppEnv = {
  Bindings: Bindings
  Variables: { dev: CurrentDev }
}
