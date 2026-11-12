import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env'
import { requireDev, requireTeamPassword } from '../auth'
import { createDatabase } from '../db/client'
import {
  applyDayChanges,
  closeMonth,
  confirmMonth,
  listMonths,
  monthLog,
  monthView,
  openMonth,
} from '../store/months'
import { importClosedMonth, sheetDifferences } from '../store/sheet'
import { csvSchema, dateSchema, dayContentSchema, monthIdSchema, validate } from '../validation'

const monthParam = z.object({ month: monthIdSchema })
const MAX_DAYS_IN_MONTH = 31

export const monthRoutes = new Hono<AppEnv>()
  .get('/', requireDev, async (context) => {
    return context.json(await listMonths(createDatabase(context.env.DB)))
  })
  /** One-time starting point (decisions #16): the sheet's month, imported closed. */
  .post('/import', requireTeamPassword, validate('json', csvSchema), async (context) => {
    const imported = await importClosedMonth(createDatabase(context.env.DB), context.req.valid('json').csv)
    return context.json(imported, 201)
  })
  .get('/:month', requireDev, validate('param', monthParam), async (context) => {
    return context.json(await monthView(createDatabase(context.env.DB), context.req.valid('param').month))
  })
  /** Normally the cron does this on the 20th (decisions #7); also available by hand. */
  .post('/:month/open', requireDev, validate('param', monthParam), async (context) => {
    const database = createDatabase(context.env.DB)
    const { month } = context.req.valid('param')
    await openMonth(database, month, context.var.dev.id)
    return context.json(await monthView(database, month), 201)
  })
  .get('/:month/log', requireDev, validate('param', monthParam), async (context) => {
    return context.json(await monthLog(createDatabase(context.env.DB), context.req.valid('param').month))
  })
  .put(
    '/:month/days/:date',
    requireDev,
    validate('param', monthParam.extend({ date: dateSchema })),
    validate('json', dayContentSchema),
    async (context) => {
      const { month, date } = context.req.valid('param')
      const change = { date, ...context.req.valid('json') }
      const applied = await applyDayChanges(
        createDatabase(context.env.DB),
        month,
        [change],
        context.var.dev.id,
        'edit',
      )
      return context.json(applied)
    },
  )
  /** Applies differences read from the sheet (decisions #23); the MCP server uses it too. */
  .post(
    '/:month/changes',
    requireDev,
    validate('param', monthParam),
    validate(
      'json',
      z.object({
        changes: z
          .array(dayContentSchema.extend({ date: dateSchema }))
          .min(1)
          .max(MAX_DAYS_IN_MONTH),
      }),
    ),
    async (context) => {
      const applied = await applyDayChanges(
        createDatabase(context.env.DB),
        context.req.valid('param').month,
        context.req.valid('json').changes,
        context.var.dev.id,
        'sync',
      )
      return context.json(applied)
    },
  )
  .post(
    '/:month/sheet-diff',
    requireDev,
    validate('param', monthParam),
    validate('json', csvSchema),
    async (context) => {
      const differences = await sheetDifferences(
        createDatabase(context.env.DB),
        context.req.valid('param').month,
        context.req.valid('json').csv,
      )
      return context.json({ differences })
    },
  )
  .post('/:month/confirm', requireDev, validate('param', monthParam), async (context) => {
    await confirmMonth(createDatabase(context.env.DB), context.req.valid('param').month, context.var.dev.id)
    return context.json({ ok: true })
  })
  .post('/:month/close', requireDev, validate('param', monthParam), async (context) => {
    await closeMonth(createDatabase(context.env.DB), context.req.valid('param').month, context.var.dev.id)
    return context.json({ ok: true })
  })
