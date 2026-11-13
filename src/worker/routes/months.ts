import { Hono } from 'hono'
import { z } from 'zod'
import { saoPauloDate } from '../../schedule/calendar'
import type { AppEnv } from '../app-env'
import { requireDev, requireTeamPassword } from '../auth'
import { createDatabase } from '../db/client'
import {
  applyDayChanges,
  closeMonth,
  confirmMonth,
  EXPORT_FORMATS,
  exportMonth,
  listMonths,
  monthLog,
  monthView,
  openMonth,
  regenerateMonth,
  unconfirmMonth,
} from '../store/months'
import { importMonth, sheetDifferences } from '../store/sheet'
import { csvSchema, dateSchema, dayContentSchema, monthIdSchema, validate } from '../validation'

const monthParam = z.object({ month: monthIdSchema })
const MAX_DAYS_IN_MONTH = 31

export const monthRoutes = new Hono<AppEnv>()
  .get('/', requireDev, async (context) => {
    return context.json(await listMonths(createDatabase(context.env.DB)))
  })
  /** One-time starting point (decisions #16): the sheet's month, imported as already exported. */
  .post('/import', requireTeamPassword, validate('json', csvSchema), async (context) => {
    const imported = await importMonth(createDatabase(context.env.DB), context.req.valid('json').csv)
    return context.json(imported, 201)
  })
  .get('/:month', requireDev, validate('param', monthParam), async (context) => {
    return context.json(await monthView(createDatabase(context.env.DB), context.req.valid('param').month))
  })
  /** Any dev, whenever the team wants the next month's roster (decisions #7). */
  .post('/:month/open', requireDev, validate('param', monthParam), async (context) => {
    const database = createDatabase(context.env.DB)
    const { month } = context.req.valid('param')
    await openMonth(database, month, context.var.dev.id)
    return context.json(await monthView(database, month), 201)
  })
  /** Undoes the opening of a month that has not started, exported or not (decisions #31). */
  .delete('/:month', requireDev, validate('param', monthParam), async (context) => {
    const { month } = context.req.valid('param')
    await closeMonth(createDatabase(context.env.DB), month, saoPauloDate(new Date()))
    // The month's own log goes with it: the Worker log is what records who closed it.
    console.log(`${context.var.dev.nickname} closed ${month}`)
    return context.json({ closed: month })
  })
  /** A new suggestion from today's profiles, before the first export (decisions #28). */
  .post('/:month/regenerate', requireDev, validate('param', monthParam), async (context) => {
    const database = createDatabase(context.env.DB)
    const { month } = context.req.valid('param')
    await regenerateMonth(database, month, context.var.dev.id)
    return context.json(await monthView(database, month))
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
  .delete('/:month/confirm', requireDev, validate('param', monthParam), async (context) => {
    await unconfirmMonth(createDatabase(context.env.DB), context.req.valid('param').month, context.var.dev.id)
    return context.json({ ok: true })
  })
  .post(
    '/:month/export',
    requireDev,
    validate('param', monthParam),
    validate('json', z.object({ format: z.enum(EXPORT_FORMATS) })),
    async (context) => {
      const exported = await exportMonth(
        createDatabase(context.env.DB),
        context.req.valid('param').month,
        context.var.dev.id,
        context.req.valid('json').format,
      )
      return context.json(exported)
    },
  )
