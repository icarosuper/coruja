import { drizzle } from 'drizzle-orm/d1'
import type { Bindings } from '../bindings'
import * as schema from './schema'

export function createDatabase(d1: Bindings['DB']) {
  return drizzle(d1, { schema })
}

export type Database = ReturnType<typeof createDatabase>
