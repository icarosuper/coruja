import type { InferResponseType } from 'hono/client'
import type { api } from '../api'

// Shapes of the profile screen, taken from the API (never declared by hand, decisions #12).
export type NotificationView = InferResponseType<typeof api.api.me.notifications.$get, 200>
export type NotificationSettings = NotificationView['settings']
