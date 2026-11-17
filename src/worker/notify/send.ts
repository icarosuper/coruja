import { saoPauloDate } from '../../schedule/calendar'
import { addDays, type MonthId } from '../../schedule/dates'
import { remindersDue, shiftEndsAt } from '../../schedule/reminders'
import type { Database } from '../db/client'
import type { ChangedDay } from '../store/months'
import {
  activeDevsWithSettings,
  claimReminder,
  pruneSentReminders,
  releaseReminder,
  reminderId,
  reminderSettingsOf,
  sentReminderIds,
} from '../store/notifications'
import { loadShiftDays } from '../store/shift-days'
import { monthOpenedText, reminderText, shiftChangeText } from './messages'
import { type NtfyConfig, publish, topicOf } from './ntfy'

// Who gets which notification (decisions #32). Nothing here depends on Cloudflare: the cron handler
// and the routes call these with a database, the time and the ntfy server.

export type NotifyContext = { database: Database; ntfy: NtfyConfig; appUrl: string }

/** Sent reminders are kept this long, then pruned; longer than any reminder can be late. */
const SENT_REMINDERS_KEPT_DAYS = 7

const monthLink = (appUrl: string, month: MonthId) => `${appUrl}/#/mes/${month}`

/**
 * Sends every shift reminder that is due and not sent yet. Runs every minute; a run that is skipped
 * is caught up by the next one (up to `MAX_REMINDER_DELAY_MS`). A failed send is retried next run.
 */
export async function sendDueReminders({ database, ntfy, appUrl }: NotifyContext, now: Date): Promise<void> {
  const today = saoPauloDate(now)
  // Yesterday's shift is still running this morning; tomorrow's eve reminder goes out today.
  const dates = [addDays(today, -1), today, addDays(today, 1)]
  const [shiftDays, recipients, alreadySent] = await Promise.all([
    loadShiftDays(database, { fromDate: dates[0] ?? today, toDate: dates[2] ?? today }),
    activeDevsWithSettings(database),
    sentReminderIds(database, dates),
  ])
  const settingsByDev = new Map(recipients.map((dev) => [dev.id, reminderSettingsOf(dev.settings)]))
  const recipientById = new Map(recipients.map((dev) => [dev.id, dev]))

  const due = remindersDue({ now: now.getTime(), days: shiftDays, settingsByDev })
  const notSentYet = due.filter((reminder) => !alreadySent.has(reminderId(reminder)))
  for (const reminder of notSentYet) {
    const dev = recipientById.get(reminder.devId)
    if (!dev) continue
    const isClaimed = await claimReminder(database, reminder, now)
    if (!isClaimed) continue
    try {
      const click = monthLink(appUrl, reminder.date.slice(0, 7))
      await publish(ntfy, { topic: topicOf(dev), click, ...reminderText(reminder) })
    } catch (failure) {
      console.error(`Reminder ${reminderId(reminder)} not sent: ${(failure as Error).message}`)
      await releaseReminder(database, reminder)
    }
  }
  await pruneSentReminders(database, addDays(today, -SENT_REMINDERS_KEPT_DAYS))
}

/**
 * Tells each dev whose shifts changed, except whoever changed them, in one notification with every
 * day of theirs. Shifts that are over are left out: a swap recorded afterwards is no news.
 */
export async function notifyShiftChanges(
  { database, ntfy, appUrl }: NotifyContext,
  input: {
    month: MonthId
    changedDays: ChangedDay[]
    actor: { id: number; nickname: string } | null
    now: Date
  },
): Promise<void> {
  const upcoming = input.changedDays.filter((day) => shiftEndsAt(day.date) > input.now.getTime())
  const devIds = [...new Set(upcoming.flatMap((day) => day.devIds))].filter(
    (devId) => devId !== input.actor?.id,
  )
  if (devIds.length === 0) return

  const recipients = await activeDevsWithSettings(database, devIds)
  const wantsIt = recipients.filter((dev) => dev.settings.shiftChangedEnabled)
  await Promise.all(
    wantsIt.map(async (dev) => {
      const devDays = upcoming
        .filter((day) => day.devIds.includes(dev.id))
        .map((day) => ({ ...day, segments: day.segments.filter((segment) => segment.devId === dev.id) }))
      const text = shiftChangeText(devDays, input.actor?.nickname ?? null)
      await publish(ntfy, { topic: topicOf(dev), click: monthLink(appUrl, input.month), ...text })
    }),
  )
}

/** Tells the month's participants, except whoever opened it, that a roster waits for their confirmation. */
export async function notifyMonthOpened(
  { database, ntfy, appUrl }: NotifyContext,
  input: {
    month: MonthId
    participantIds: number[]
    actor: { id: number; nickname: string }
    isRegenerated: boolean
  },
): Promise<void> {
  const others = input.participantIds.filter((devId) => devId !== input.actor.id)
  if (others.length === 0) return

  const recipients = await activeDevsWithSettings(database, others)
  const wantsIt = recipients.filter((dev) => dev.settings.monthOpenedEnabled)
  const text = monthOpenedText(input.month, input.actor.nickname, input.isRegenerated)
  await Promise.all(
    wantsIt.map((dev) =>
      publish(ntfy, { topic: topicOf(dev), click: monthLink(appUrl, input.month), ...text }),
    ),
  )
}
