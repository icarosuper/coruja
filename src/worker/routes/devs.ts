import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env'
import { requireDev, requireTeamPassword } from '../auth'
import { createDatabase } from '../db/client'
import { createDev, issueToken, listDevs, setWeight, updateDev } from '../store/devs'
import { addAbsence, loadProfile, removeAbsence, replaceRules } from '../store/profile'
import {
  absenceBodySchema,
  idSchema,
  nicknameSchema,
  rulesBodySchema,
  validate,
  weightSchema,
} from '../validation'

const idParam = z.object({ id: idSchema })

// Adding devs, renaming, (de)activating, tokens and editing someone else's profile need the team
// password (decisions #3); the weight is anyone's to change (#18).
export const devRoutes = new Hono<AppEnv>()
  .get('/', requireDev, async (context) => {
    return context.json(await listDevs(createDatabase(context.env.DB)))
  })
  .post(
    '/',
    requireTeamPassword,
    validate('json', z.object({ nickname: nicknameSchema, weight: weightSchema.default(100) })),
    async (context) => {
      const created = await createDev(createDatabase(context.env.DB), context.req.valid('json'))
      return context.json(created, 201)
    },
  )
  .patch(
    '/:id',
    requireTeamPassword,
    validate('param', idParam),
    validate('json', z.object({ nickname: nicknameSchema.optional(), active: z.boolean().optional() })),
    async (context) => {
      await updateDev(
        createDatabase(context.env.DB),
        context.req.valid('param').id,
        context.req.valid('json'),
      )
      return context.json({ ok: true })
    },
  )
  .post('/:id/token', requireTeamPassword, validate('param', idParam), async (context) => {
    const token = await issueToken(createDatabase(context.env.DB), context.req.valid('param').id)
    return context.json({ token })
  })
  .put(
    '/:id/weight',
    requireDev,
    validate('param', idParam),
    validate('json', z.object({ weight: weightSchema })),
    async (context) => {
      const { id } = context.req.valid('param')
      await setWeight(createDatabase(context.env.DB), id, context.req.valid('json').weight)
      return context.json({ ok: true })
    },
  )
  /** Someone else's profile, for when they cannot edit it themselves. Same rules as `/me`. */
  .get('/:id/profile', requireTeamPassword, validate('param', idParam), async (context) => {
    return context.json(await loadProfile(createDatabase(context.env.DB), context.req.valid('param').id))
  })
  .put(
    '/:id/rules',
    requireTeamPassword,
    validate('param', idParam),
    validate('json', rulesBodySchema),
    async (context) => {
      const database = createDatabase(context.env.DB)
      const { id } = context.req.valid('param')
      await loadProfile(database, id)
      await replaceRules(database, id, context.req.valid('json').rules)
      return context.json({ ok: true })
    },
  )
  .post(
    '/:id/absences',
    requireTeamPassword,
    validate('param', idParam),
    validate('json', absenceBodySchema),
    async (context) => {
      const database = createDatabase(context.env.DB)
      const { id } = context.req.valid('param')
      await loadProfile(database, id)
      return context.json(await addAbsence(database, id, context.req.valid('json')), 201)
    },
  )
  .delete(
    '/:id/absences/:absenceId',
    requireTeamPassword,
    validate('param', idParam.extend({ absenceId: idSchema })),
    async (context) => {
      const { id, absenceId } = context.req.valid('param')
      await removeAbsence(createDatabase(context.env.DB), id, absenceId)
      return context.json({ ok: true })
    },
  )
