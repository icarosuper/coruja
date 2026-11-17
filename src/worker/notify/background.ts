import type { Context } from 'hono'
import type { AppEnv } from '../app-env'
import { createDatabase } from '../db/client'
import { ntfyConfigOf } from './ntfy'
import type { NotifyContext } from './send'

/**
 * Sends notifications after the response, so a slow or unreachable ntfy server never delays nor
 * fails the request that caused them. Does nothing when ntfy is not configured.
 */
export function notifyInBackground(context: Context<AppEnv>, send: (notify: NotifyContext) => Promise<void>) {
  const ntfy = ntfyConfigOf(context.env)
  if (!ntfy) return
  const notify = { database: createDatabase(context.env.DB), ntfy, appUrl: context.env.APP_URL }
  const sending = send(notify).catch((failure: Error) => {
    console.error(`Notification not sent: ${failure.message}`)
  })
  context.executionCtx.waitUntil(sending)
}
