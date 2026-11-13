import { Hono } from 'hono'
import type { AppEnv } from '../app-env'
import { requireDev } from '../auth'
import { createDatabase } from '../db/client'
import { loadProfile, replaceRules, setAbsenceDays } from '../store/profile'
import { absenceDaysBodySchema, rulesBodySchema, validate } from '../validation'

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
