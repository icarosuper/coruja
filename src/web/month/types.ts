import type { InferResponseType } from 'hono/client'
import type { api } from '../api'

// Shapes of the month screen, taken from the API (never declared by hand, decisions #12).
export type MonthView = InferResponseType<(typeof api.api.months)[':month']['$get'], 200>
export type MonthDay = MonthView['days'][number]
export type Dev = InferResponseType<typeof api.api.devs.$get, 200>[number]
export type LogEntry = InferResponseType<(typeof api.api.months)[':month']['log']['$get'], 200>[number]
export type MonthSummary = InferResponseType<typeof api.api.months.$get, 200>[number]
