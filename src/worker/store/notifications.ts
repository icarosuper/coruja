import { and, eq, inArray, lt } from 'drizzle-orm'
import type { IsoDate } from '../../schedule/dates'
import type { Reminder, ReminderSettings } from '../../schedule/reminders'
import type { Database } from '../db/client'
import { DEFAULT_NOTIFICATION_SETTINGS, devs, notificationSettings, sentReminders } from '../db/schema'

// What each dev wants to hear about (decisions #32) and which reminders already went out.

export type NotificationSettings = typeof DEFAULT_NOTIFICATION_SETTINGS

function settingsOf(row: typeof notificationSettings.$inferSelect | null): NotificationSettings {
  if (!row) return { ...DEFAULT_NOTIFICATION_SETTINGS }
  const { devId: _devId, ...settings } = row
  return settings
}

export function reminderSettingsOf(settings: NotificationSettings): ReminderSettings {
  return {
    eve: settings.eveEnabled ? settings.eveTime : null,
    day: settings.dayEnabled ? settings.dayTime : null,
    shiftStart: settings.shiftStartEnabled,
  }
}

export async function loadNotificationSettings(database: Database, devId: number) {
  const row = await database.query.notificationSettings.findFirst({
    where: eq(notificationSettings.devId, devId),
  })
  return settingsOf(row ?? null)
}

export async function saveNotificationSettings(
  database: Database,
  devId: number,
  settings: NotificationSettings,
): Promise<void> {
  await database
    .insert(notificationSettings)
    .values({ devId, ...settings })
    .onConflictDoUpdate({ target: notificationSettings.devId, set: settings })
}

/** Active devs (all of them, or those in `devIds`) with their settings: the ones notifications go to. */
export async function activeDevsWithSettings(database: Database, devIds?: number[]) {
  const onlySome = devIds === undefined ? undefined : inArray(devs.id, devIds)
  const rows = await database
    .select({ id: devs.id, nickname: devs.nickname, settings: notificationSettings })
    .from(devs)
    .leftJoin(notificationSettings, eq(notificationSettings.devId, devs.id))
    .where(and(eq(devs.active, true), onlySome))
  return rows.map((row) => ({ id: row.id, nickname: row.nickname, settings: settingsOf(row.settings) }))
}

const reminderKey = (reminder: Reminder) => ({
  devId: reminder.devId,
  date: reminder.date,
  kind: reminder.kind,
  fromHour: reminder.fromHour,
})

/** Keys (`reminderId`) of the reminders already sent for shifts on `dates`. */
export async function sentReminderIds(database: Database, dates: IsoDate[]): Promise<Set<string>> {
  const rows = await database.select().from(sentReminders).where(inArray(sentReminders.date, dates))
  return new Set(rows.map(reminderId))
}

export function reminderId(reminder: Pick<Reminder, 'devId' | 'date' | 'kind' | 'fromHour'>): string {
  return `${reminder.devId}:${reminder.date}:${reminder.kind}:${reminder.fromHour}`
}

/**
 * Marks the reminder as sent before sending it. False when it already was, so two runs at once never
 * send it twice. A failed send gives it back with `releaseReminder`, for the next run to try again.
 */
export async function claimReminder(database: Database, reminder: Reminder, now: Date): Promise<boolean> {
  const inserted = await database
    .insert(sentReminders)
    .values({ ...reminderKey(reminder), sentAt: now })
    .onConflictDoNothing()
    .returning({ devId: sentReminders.devId })
  return inserted.length > 0
}

export async function releaseReminder(database: Database, reminder: Reminder): Promise<void> {
  const key = reminderKey(reminder)
  await database
    .delete(sentReminders)
    .where(
      and(
        eq(sentReminders.devId, key.devId),
        eq(sentReminders.date, key.date),
        eq(sentReminders.kind, key.kind),
        eq(sentReminders.fromHour, key.fromHour),
      ),
    )
}

/** Reminders of shifts before `date` can never be due again. */
export async function pruneSentReminders(database: Database, date: IsoDate): Promise<void> {
  await database.delete(sentReminders).where(lt(sentReminders.date, date))
}
