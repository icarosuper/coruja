import { Hono } from 'hono'
import type { Bindings } from './bindings'

// Routes are chained so their types accumulate in `app`: the web client is typed from `AppType`.
const app = new Hono<{ Bindings: Bindings }>()
  .basePath('/api')
  .get('/health', (context) => context.json({ status: 'ok' }))

export type AppType = typeof app

export { app }
export default app
