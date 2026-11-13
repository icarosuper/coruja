import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { z } from 'zod'
import { MAX_ABSENCE_DAYS } from '../schedule/preferences'
import { DAY_KINDS, PREFERENCE_RULE_KINDS, PREFERENCES } from './db/schema'
import { ApiError } from './errors'

/** Like `zValidator`, but invalid input answers `{ error: 'invalid_request', issues }` with 400. */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) throw new ApiError(400, 'invalid_request', { issues: result.error.issues })
  })
}

export const monthIdSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM')
export const dateSchema = z.iso.date()
export const idSchema = z.coerce.number().int().positive()
/** Participation weight in percent (decisions #18). */
export const weightSchema = z.number().int().min(0).max(100)
/** Short enough to fit a calendar cell. */
export const MAX_NICKNAME_LENGTH = 20
export const nicknameSchema = z.string().trim().min(1).max(MAX_NICKNAME_LENGTH)
/** The sheet exported as CSV, already decoded to text. A month's sheet is a few dozen KB. */
export const csvSchema = z.object({ csv: z.string().min(1).max(2_000_000) })

const MAX_WEEKDAY = 6

export const preferenceRuleSchema = z.object({
  kind: z.enum(PREFERENCE_RULE_KINDS),
  value: z.number().int().min(0).max(MAX_WEEKDAY),
  preference: z.enum(PREFERENCES),
})

const MAX_SHIFT_HOURS = 24
export const segmentSchema = z.object({
  devId: z.number().int().positive(),
  fromHour: z.number().int().min(0).max(MAX_SHIFT_HOURS),
  toHour: z.number().int().min(0).max(MAX_SHIFT_HOURS),
})
export const dayContentSchema = z.object({
  kind: z.enum(DAY_KINDS),
  segments: z.array(segmentSchema).max(MAX_SHIFT_HOURS),
})

const MAX_RULES = 7 // one per weekday
export const rulesBodySchema = z.object({ rules: z.array(preferenceRuleSchema).max(MAX_RULES) })

const DAY_MS = 24 * 60 * 60 * 1000

/** Marks (`absent: true`) or clears every day from `fromDate` to `toDate`, both included. */
export const absenceDaysBodySchema = z
  .object({ fromDate: dateSchema, toDate: dateSchema, absent: z.boolean() })
  .refine((body) => body.fromDate <= body.toDate, {
    message: 'toDate is before fromDate',
    path: ['toDate'],
  })
  .refine((body) => Date.parse(body.toDate) - Date.parse(body.fromDate) < MAX_ABSENCE_DAYS * DAY_MS, {
    message: `at most ${MAX_ABSENCE_DAYS} days at once`,
    path: ['toDate'],
  })
