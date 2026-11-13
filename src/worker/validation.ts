import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { z } from 'zod'
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
const MAX_MONTH_DAY = 31

export const preferenceRuleSchema = z
  .object({
    kind: z.enum(PREFERENCE_RULE_KINDS),
    value: z.number().int(),
    preference: z.enum(PREFERENCES),
  })
  .refine(
    (rule) =>
      rule.kind === 'weekday'
        ? rule.value >= 0 && rule.value <= MAX_WEEKDAY
        : rule.value >= 1 && rule.value <= MAX_MONTH_DAY,
    { message: 'weekday is 0–6, month_day is 1–31', path: ['value'] },
  )

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
