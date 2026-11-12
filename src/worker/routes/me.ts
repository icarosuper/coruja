import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env'
import { requireDev } from '../auth'
import { createDatabase } from '../db/client'
import { addAbsence, loadProfile, removeAbsence, replaceRules } from '../store/profile'
import { dateSchema, idSchema, preferenceRuleSchema, validate } from '../validation'

const MAX_RULES = 38 // 7 weekdays + 31 days of the month

/** The calling dev's own profile (decisions #5). */
export const meRoutes = new Hono<AppEnv>()
  .use(requireDev)
  .get('/', async (context) => {
    return context.json(await loadProfile(createDatabase(context.env.DB), context.var.dev.id))
  })
  .put(
    '/rules',
    validate('json', z.object({ rules: z.array(preferenceRuleSchema).max(MAX_RULES) })),
    async (context) => {
      await replaceRules(createDatabase(context.env.DB), context.var.dev.id, context.req.valid('json').rules)
      return context.json({ ok: true })
    },
  )
  .post(
    '/absences',
    validate(
      'json',
      z.object({
        fromDate: dateSchema,
        toDate: dateSchema,
        note: z.string().trim().max(200).nullable().default(null),
      }),
    ),
    async (context) => {
      const absence = await addAbsence(
        createDatabase(context.env.DB),
        context.var.dev.id,
        context.req.valid('json'),
      )
      return context.json(absence, 201)
    },
  )
  .delete('/absences/:id', validate('param', z.object({ id: idSchema })), async (context) => {
    await removeAbsence(createDatabase(context.env.DB), context.var.dev.id, context.req.valid('param').id)
    return context.json({ ok: true })
  })
