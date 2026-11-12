import { hc } from 'hono/client'
import type { AppType } from '../worker/index'

// Typed from the Worker's routes: no request/response types are declared on the web side.
export const api = hc<AppType>('/')
