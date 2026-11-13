import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { PREFERENCE_RULE_KINDS, PREFERENCES } from '../../schedule/preferences'
import { DAY_KINDS } from '../../schedule/shifts'

// Data model: docs/agents/architecture.md ("Domain") and decisions #2, #5, #7, #16, #18–#22.
// Derived values are NOT stored: hours per dev, balances and "ready for export" are computed.

export { DAY_KINDS, PREFERENCE_RULE_KINDS, PREFERENCES }
export const BALANCE_ADJUSTMENT_REASONS = ['joined', 'import'] as const
export const CHANGE_LOG_ACTIONS = [
  'generate',
  'regenerate',
  'assign',
  'split',
  'day_kind',
  'sync',
  'confirm',
  'unconfirm',
  'export',
  'import',
] as const

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())

/** Devs are never deleted, only deactivated (#19). */
export const devs = sqliteTable(
  'devs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nickname: text('nickname').notNull().unique(),
    /** Participation weight in percent (#18). */
    weight: integer('weight').notNull().default(100),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    /** Hash of the personal token (#3); null until a token is issued. */
    tokenHash: text('token_hash').unique(),
    createdAt: createdAt(),
    deactivatedAt: integer('deactivated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [check('devs_weight_not_negative', sql`${table.weight} >= 0`)],
)

/** Recurring profile rules (#5). No row = neutral. */
export const preferenceRules = sqliteTable(
  'preference_rules',
  {
    devId: integer('dev_id')
      .notNull()
      .references(() => devs.id),
    kind: text('kind', { enum: PREFERENCE_RULE_KINDS }).notNull(),
    /** 0–6 (Sunday = 0) for `weekday`, 1–31 for `month_day`. */
    value: integer('value').notNull(),
    preference: text('preference', { enum: PREFERENCES }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.devId, table.kind, table.value] }),
    check(
      'preference_rules_value_in_range',
      sql`(${table.kind} = 'weekday' AND ${table.value} BETWEEN 0 AND 6) OR (${table.kind} = 'month_day' AND ${table.value} BETWEEN 1 AND 31)`,
    ),
    check('preference_rules_preference_valid', sql`${table.preference} IN ('good', 'avoid', 'cant')`),
  ],
)

/** Planned absences (#5): treated as `cant` when a month opens. Dates are `YYYY-MM-DD`, inclusive. */
export const absences = sqliteTable(
  'absences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    devId: integer('dev_id')
      .notNull()
      .references(() => devs.id),
    fromDate: text('from_date').notNull(),
    toDate: text('to_date').notNull(),
    note: text('note'),
  },
  (table) => [
    index('absences_dev_id_idx').on(table.devId),
    check('absences_range_valid', sql`${table.fromDate} <= ${table.toDate}`),
  ],
)

/**
 * One row per month; `id` is `YYYY-MM`. A month is open from the 20th of the month before; there is
 * no closing (#7): exporting to the sheet is recorded instead. "Ready" is derived, not stored (#22).
 */
export const months = sqliteTable('months', {
  id: text('id').primaryKey(),
  openedAt: integer('opened_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Last export to the manager's sheet (#7); null until someone exports. */
  exportedAt: integer('exported_at', { mode: 'timestamp_ms' }),
  /** Null when the month came from the sheet itself (#16). */
  exportedByDevId: integer('exported_by_dev_id').references(() => devs.id),
})

/** Who takes part in a month and with which weight, frozen when the month opens (#18). */
export const monthParticipants = sqliteTable(
  'month_participants',
  {
    monthId: text('month_id')
      .notNull()
      .references(() => months.id),
    devId: integer('dev_id')
      .notNull()
      .references(() => devs.id),
    weight: integer('weight').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.monthId, table.devId] }),
    check('month_participants_weight_not_negative', sql`${table.weight} >= 0`),
  ],
)

/** One row per calendar day = that day's shift (#2). `date` is `YYYY-MM-DD`. */
export const days = sqliteTable(
  'days',
  {
    date: text('date').primaryKey(),
    monthId: text('month_id')
      .notNull()
      .references(() => months.id),
    /** `workday` = 18:00→09:00 (15h), `day_off` = 09:00→09:00 (24h). Anyone can flip it (#14). */
    kind: text('kind', { enum: DAY_KINDS }).notNull(),
    holidayName: text('holiday_name'),
  },
  (table) => [
    index('days_month_id_idx').on(table.monthId),
    check('days_kind_valid', sql`${table.kind} IN ('workday', 'day_off')`),
  ],
)

/**
 * Who covers which part of a day's shift. Hours count from the shift start (0–15 or 0–24).
 * Normally one segment covers the whole shift; a split shift has several; an unassigned day has
 * none. Segments of a day cover the shift without gaps or overlaps — enforced in code.
 */
export const shiftSegments = sqliteTable(
  'shift_segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date')
      .notNull()
      .references(() => days.date, { onDelete: 'cascade' }),
    devId: integer('dev_id')
      .notNull()
      .references(() => devs.id),
    fromHour: integer('from_hour').notNull(),
    toHour: integer('to_hour').notNull(),
  },
  (table) => [
    index('shift_segments_date_idx').on(table.date),
    index('shift_segments_dev_id_idx').on(table.devId),
    check(
      'shift_segments_hours_valid',
      sql`${table.fromHour} >= 0 AND ${table.fromHour} < ${table.toHour} AND ${table.toHour} <= 24`,
    ),
  ],
)

/** Only participants of the month can confirm it (composite FK). An edit deletes the affected rows. */
export const confirmations = sqliteTable(
  'confirmations',
  {
    monthId: text('month_id').notNull(),
    devId: integer('dev_id').notNull(),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.monthId, table.devId] }),
    foreignKey({
      columns: [table.monthId, table.devId],
      foreignColumns: [monthParticipants.monthId, monthParticipants.devId],
    }),
  ],
)

/** Balance changes that do not come from shifts: joining at the team average (#19), import (#16). */
export const balanceAdjustments = sqliteTable(
  'balance_adjustments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    devId: integer('dev_id')
      .notNull()
      .references(() => devs.id),
    /** Month the adjustment belongs to, for context; null when it belongs to none. */
    monthId: text('month_id').references(() => months.id),
    hours: real('hours').notNull(),
    reason: text('reason', { enum: BALANCE_ADJUSTMENT_REASONS }).notNull(),
    createdAt: createdAt(),
    createdByDevId: integer('created_by_dev_id').references(() => devs.id),
  },
  (table) => [
    index('balance_adjustments_dev_id_idx').on(table.devId),
    check('balance_adjustments_reason_valid', sql`${table.reason} IN ('joined', 'import')`),
  ],
)

/** Every change to a month's roster (#21). `before`/`after` are JSON. Null actor = the cron. */
export const changeLog = sqliteTable(
  'change_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    monthId: text('month_id')
      .notNull()
      .references(() => months.id),
    date: text('date'),
    actorDevId: integer('actor_dev_id').references(() => devs.id),
    action: text('action', { enum: CHANGE_LOG_ACTIONS }).notNull(),
    before: text('before', { mode: 'json' }),
    after: text('after', { mode: 'json' }),
    createdAt: createdAt(),
  },
  (table) => [index('change_log_month_id_idx').on(table.monthId)],
)
