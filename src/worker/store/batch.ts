import type { BatchItem } from 'drizzle-orm/batch'
import type { SQLiteInsertValue, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Database } from '../db/client'

/** Runs the statements atomically (D1 has no interactive transactions; a batch is one transaction). */
export async function runBatch(database: Database, statements: BatchItem<'sqlite'>[]): Promise<void> {
  const [first, ...rest] = statements
  if (!first) return
  await database.batch([first, ...rest])
}

/** D1 refuses a statement with more than 100 bound parameters. */
const MAX_PARAMETERS_PER_STATEMENT = 100

/**
 * Multi-row inserts, as few as D1's parameter limit allows. Counts one spare parameter per row for
 * columns Drizzle fills by itself (`$defaultFn`).
 */
export function insertRows<Table extends SQLiteTable>(
  database: Database,
  table: Table,
  rows: SQLiteInsertValue<Table>[],
): BatchItem<'sqlite'>[] {
  const firstRow = rows[0]
  if (!firstRow) return []
  const parametersPerRow = Object.keys(firstRow).length + 1
  const rowsPerStatement = Math.max(1, Math.floor(MAX_PARAMETERS_PER_STATEMENT / parametersPerRow))
  const statements: BatchItem<'sqlite'>[] = []
  for (let start = 0; start < rows.length; start += rowsPerStatement) {
    statements.push(database.insert(table).values(rows.slice(start, start + rowsPerStatement)))
  }
  return statements
}
