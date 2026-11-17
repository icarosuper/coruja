import { eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { devs } from '../db/schema'
import { ApiError } from '../errors'
import { loadNotificationSettings } from '../store/notifications'
import { TEST_TEXT } from './messages'
import { type NtfyConfig, NtfyError, publish, subscribeLinks, topicOf } from './ntfy'

// The profile's "Notificações" section (decisions #32): where to subscribe and what to hear about.

async function findDev(database: Database, devId: number) {
  const dev = await database.query.devs.findFirst({ where: eq(devs.id, devId) })
  if (!dev) throw new ApiError(404, 'dev_not_found')
  return dev
}

/** `subscription` is null when the admin has not configured ntfy. */
export async function notificationView(database: Database, ntfy: NtfyConfig | null, devId: number) {
  const [dev, settings] = await Promise.all([
    findDev(database, devId),
    loadNotificationSettings(database, devId),
  ])
  const topic = topicOf(dev)
  const subscription = ntfy ? { topic, ...subscribeLinks(ntfy, topic) } : null
  return { subscription, settings }
}

/** Sends a test notification to the dev's topic, answering whether the ntfy server took it. */
export async function sendTestNotification(database: Database, ntfy: NtfyConfig | null, devId: number) {
  if (!ntfy) throw new ApiError(503, 'ntfy_not_configured')
  const dev = await findDev(database, devId)
  try {
    await publish(ntfy, { topic: topicOf(dev), ...TEST_TEXT })
  } catch (failure) {
    if (!(failure instanceof NtfyError)) throw failure
    console.error(failure.message)
    throw new ApiError(502, 'ntfy_failed')
  }
}
