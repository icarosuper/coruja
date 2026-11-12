import type { D1Database } from '@cloudflare/workers-types'

// Declared as a module (not the global `Env` from worker-configuration.d.ts) because the web app
// type-checks this file too when it imports `AppType`, and the global Workers types clash with DOM.
// Keep in sync with wrangler.jsonc and the secrets (`wrangler secret put`).
export type Bindings = {
  DB: D1Database
  /** Guards admin actions (decisions #3). Local dev reads it from `.dev.vars`. */
  TEAM_PASSWORD: string
}
