import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types'
import { Hono } from 'hono'
import type { AppEnv } from './app-env'
import { requireTeamPassword } from './auth'
import type { Bindings } from './bindings'
import { createDatabase } from './db/client'
import { ApiError } from './errors'
import { ntfyConfigOf } from './notify/ntfy'
import { sendDueReminders } from './notify/send'
import { devRoutes } from './routes/devs'
import { meRoutes } from './routes/me'
import { monthRoutes } from './routes/months'

// Routes are chained so their types accumulate in `app`: the web client is typed from `AppType`.
const app = new Hono<AppEnv>()
  .basePath('/api')
  .get('/health', (context) => context.json({ status: 'ok' }))
  /** Lets the admin screen check the team password before showing anything. */
  .get('/team/check', requireTeamPassword, (context) => context.json({ ok: true }))
  .route('/devs', devRoutes)
  .route('/me', meRoutes)
  .route('/months', monthRoutes)

app.onError((error, context) => {
  if (error instanceof ApiError) {
    return context.json({ error: error.code, ...error.details }, error.status)
  }
  console.error(error)
  return context.json({ error: 'internal_error' }, 500)
})

export type AppType = typeof app

export { app }

/**
 * The cron trigger (every minute, wrangler.jsonc): sends the shift reminders that are due
 * (decisions #32). The only Cloudflare-specific part; `sendDueReminders` takes plain arguments.
 */
async function scheduled(controller: ScheduledController, env: Bindings, context: ExecutionContext) {
  const ntfy = ntfyConfigOf(env)
  if (!ntfy) return
  const notify = { database: createDatabase(env.DB), ntfy, appUrl: env.APP_URL }
  context.waitUntil(sendDueReminders(notify, new Date(controller.scheduledTime)))
}

export default { fetch: app.fetch, scheduled }
