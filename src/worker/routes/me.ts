import { Hono } from 'hono'
import type { AppEnv } from '../app-env'
import { requireDev } from '../auth'
import { createDatabase } from '../db/client'
import { ntfyConfigOf } from '../notify/ntfy'
import { notificationView, sendTestNotification } from '../notify/profile'
import { saveNotificationSettings } from '../store/notifications'
import { loadProfile, replaceRules, setAbsenceDays } from '../store/profile'
import { absenceDaysBodySchema, notificationSettingsSchema, rulesBodySchema, validate } from '../validation'

/** The calling dev's own profile (decisions #5). */
export const meRoutes = new Hono<AppEnv>()
  .use(requireDev)
  .get('/', async (context) => {
    return context.json(await loadProfile(createDatabase(context.env.DB), context.var.dev.id))
  })
  .put('/rules', validate('json', rulesBodySchema), async (context) => {
    await replaceRules(createDatabase(context.env.DB), context.var.dev.id, context.req.valid('json').rules)
    return context.json({ ok: true })
  })
  .put('/absences', validate('json', absenceDaysBodySchema), async (context) => {
    const database = createDatabase(context.env.DB)
    return context.json(await setAbsenceDays(database, context.var.dev.id, context.req.valid('json')))
  })
  /** Where to subscribe and what to hear about (decisions #32). */
  .get('/notifications', async (context) => {
    const database = createDatabase(context.env.DB)
    return context.json(await notificationView(database, ntfyConfigOf(context.env), context.var.dev.id))
  })
  .put('/notifications', validate('json', notificationSettingsSchema), async (context) => {
    const database = createDatabase(context.env.DB)
    await saveNotificationSettings(database, context.var.dev.id, context.req.valid('json'))
    return context.json({ ok: true })
  })
  .post('/notifications/test', async (context) => {
    const database = createDatabase(context.env.DB)
    await sendTestNotification(database, ntfyConfigOf(context.env), context.var.dev.id)
    return context.json({ ok: true })
  })
