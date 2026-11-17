import { addDays, type IsoDate } from './dates'
import { type DayKind, type Segment, type ShiftDay, shiftStartHour } from './shifts'

// Shift reminders (decisions #32): which reminder each dev is due, from the time they chose. Pure:
// the caller gives the instant and the days, and remembers what was already sent.

export const REMINDER_KINDS = ['eve', 'day', 'shift_start'] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]

/** `HH:MM`, São Paulo time. */
export type ClockTime = string

/** A null time means that reminder is off. */
export type ReminderSettings = { eve: ClockTime | null; day: ClockTime | null; shiftStart: boolean }

export type Reminder = {
  devId: number
  /** The shift's day. */
  date: IsoDate
  dayKind: DayKind
  kind: ReminderKind
  /** Tells apart the starts of a split shift; 0 for `eve` and `day`. */
  fromHour: number
  dueAt: number
  /** The dev's own part of the shift. */
  segments: Segment<number>[]
}

/** São Paulo has had no daylight saving time since 2019: always UTC−3. */
const SAO_PAULO_OFFSET = '-03:00'
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000
/** Every shift ends at 09:00 the day after it starts (decisions #2). */
const SHIFT_END_TIME = '09:00'

/**
 * A reminder later than this is dropped: hearing about last evening's "tomorrow" at noon helps
 * nobody. Covers a cron run that was skipped or failed for a while.
 */
export const MAX_REMINDER_DELAY_MS = 2 * MILLISECONDS_PER_HOUR

export function saoPauloInstant(date: IsoDate, time: ClockTime): number {
  return Date.parse(`${date}T${time}:00${SAO_PAULO_OFFSET}`)
}

/** When the shift of `date` ends, whatever its kind. */
export function shiftEndsAt(date: IsoDate): number {
  return saoPauloInstant(addDays(date, 1), SHIFT_END_TIME)
}

function hourClock(hour: number): ClockTime {
  return `${String(hour).padStart(2, '0')}:00`
}

/** When the hours of a shift counted from `fromHour` start. */
export function segmentStartsAt(date: IsoDate, kind: DayKind, fromHour: number): number {
  return saoPauloInstant(date, hourClock(shiftStartHour(kind))) + fromHour * MILLISECONDS_PER_HOUR
}

function segmentsByDev(day: ShiftDay<number>): Map<number, Segment<number>[]> {
  const grouped = new Map<number, Segment<number>[]>()
  for (const segment of day.segments) {
    const devSegments = grouped.get(segment.devId) ?? []
    devSegments.push(segment)
    grouped.set(segment.devId, devSegments)
  }
  return grouped
}

function remindersOf(
  day: ShiftDay<number>,
  devId: number,
  segments: Segment<number>[],
  settings: ReminderSettings,
): Reminder[] {
  const base = { devId, date: day.date, dayKind: day.kind, segments }
  const reminders: Reminder[] = []
  if (settings.eve !== null) {
    const dueAt = saoPauloInstant(addDays(day.date, -1), settings.eve)
    reminders.push({ ...base, kind: 'eve', fromHour: 0, dueAt })
  }
  if (settings.day !== null) {
    reminders.push({ ...base, kind: 'day', fromHour: 0, dueAt: saoPauloInstant(day.date, settings.day) })
  }
  if (settings.shiftStart) {
    for (const segment of segments) {
      const dueAt = segmentStartsAt(day.date, day.kind, segment.fromHour)
      reminders.push({ ...base, kind: 'shift_start', fromHour: segment.fromHour, dueAt })
    }
  }
  return reminders
}

/**
 * Every reminder whose time has come by `now` and is at most `MAX_REMINDER_DELAY_MS` late, for the
 * devs in `settingsByDev`. Already sent ones are the caller's to skip.
 */
export function remindersDue(input: {
  now: number
  days: ShiftDay<number>[]
  settingsByDev: Map<number, ReminderSettings>
}): Reminder[] {
  const due: Reminder[] = []
  for (const day of input.days) {
    for (const [devId, segments] of segmentsByDev(day)) {
      const settings = input.settingsByDev.get(devId)
      if (!settings) continue
      const isDue = (reminder: Reminder) =>
        reminder.dueAt <= input.now && input.now - reminder.dueAt <= MAX_REMINDER_DELAY_MS
      due.push(...remindersOf(day, devId, segments, settings).filter(isDue))
    }
  }
  return due
}
