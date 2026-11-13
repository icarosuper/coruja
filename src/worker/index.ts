import { Hono } from 'hono'
import { saoPauloDate } from '../schedule/calendar'
import type { AppEnv } from './app-env'
import { requireTeamPassword } from './auth'
import type { Bindings } from './bindings'
import { openDueMonths } from './cron'
import { createDatabase } from './db/client'
import { ApiError } from './errors'
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

/** The scheduled run of `triggers.crons` in wrangler.jsonc. */
async function openMonthsOnSchedule(scheduledTime: number, env: Bindings): Promise<void> {
  const opened = await openDueMonths(createDatabase(env.DB), saoPauloDate(new Date(scheduledTime)))
  if (opened.length > 0) console.log(`Opened ${opened.join(', ')} with the suggested roster`)
}

// Typed by hand, not with `ExportedHandler`: the web app type-checks this file with the DOM types.
type ScheduledController = { scheduledTime: number }
type ScheduledContext = { waitUntil: (promise: Promise<unknown>) => void }

export default {
  fetch: app.fetch,
  scheduled: (controller: ScheduledController, env: Bindings, context: ScheduledContext) =>
    context.waitUntil(openMonthsOnSchedule(controller.scheduledTime, env)),
}
