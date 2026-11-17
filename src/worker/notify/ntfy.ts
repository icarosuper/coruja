import type { Bindings } from '../bindings'

// The ntfy server (decisions #32): the admin's, set as Worker secrets, never in the code. Each dev
// has a topic named after their nickname; anyone may read it, only Coruja's token may publish.

export type NtfyConfig = { serverUrl: string; token: string | null }

export type NtfyMessage = {
  topic: string
  title: string
  message: string
  /** Opened when the notification is tapped. */
  click?: string
}

const TOPIC_PREFIX = 'coruja-'
/** ntfy's own limit on topic names. */
const MAX_TOPIC_LENGTH = 64
/** Shown as the notification's icon: ntfy turns tags that name an emoji into the emoji. */
const OWL_TAG = 'owl'

/** Null when the admin has not set `NTFY_URL`: nothing is sent and the profile says so. */
export function ntfyConfigOf(bindings: Bindings): NtfyConfig | null {
  const serverUrl = bindings.NTFY_URL?.trim().replace(/\/+$/, '')
  if (!serverUrl) return null
  return { serverUrl, token: bindings.NTFY_TOKEN?.trim() || null }
}

/**
 * `coruja-<nickname>`, in the characters ntfy accepts: "Órion" → `coruja-orion`. It follows the
 * current nickname, so a renamed dev subscribes again. A nickname with nothing usable falls back to
 * the dev's id.
 */
export function topicOf(dev: { id: number; nickname: string }): string {
  const slug = dev.nickname
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TOPIC_LENGTH - TOPIC_PREFIX.length)
  return `${TOPIC_PREFIX}${slug || `dev-${dev.id}`}`
}

/** The topic on the web (to copy) and the link that opens the Android app subscribed to it (the QR). */
export function subscribeLinks(config: NtfyConfig, topic: string) {
  const server = new URL(config.serverUrl)
  const isPlainHttp = server.protocol === 'http:'
  const appQuery = new URLSearchParams({ display: 'Coruja' })
  if (isPlainHttp) appQuery.set('secure', 'false')
  const hostAndPath = `${server.host}${server.pathname.replace(/\/+$/, '')}`
  return {
    webUrl: `${config.serverUrl}/${topic}`,
    appUrl: `ntfy://${hostAndPath}/${topic}?${appQuery}`,
  }
}

export class NtfyError extends Error {}

/** Publishes as JSON, so titles and messages may carry any character (headers are Latin-1 only). */
export async function publish(config: NtfyConfig, message: NtfyMessage): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.token) headers.Authorization = `Bearer ${config.token}`
  let response: Response
  try {
    response = await fetch(`${config.serverUrl}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...message, tags: [OWL_TAG] }),
    })
  } catch (failure) {
    throw new NtfyError(`ntfy unreachable: ${(failure as Error).message}`)
  }
  if (!response.ok) throw new NtfyError(`ntfy answered ${response.status} for ${message.topic}`)
}
