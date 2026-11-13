import { Hono } from 'hono'
import type { AppEnv } from './app-env'
import { requireTeamPassword } from './auth'
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
export default app
