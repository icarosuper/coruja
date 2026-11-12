import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { D1Database } from '@cloudflare/workers-types'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import type { Bindings } from '../bindings'

// Test-only: a local D1 (Miniflare) with every migration applied, so API tests run the real SQL
// (CHECKs, FKs) through the app without a server. One database per test file, emptied before each
// test: starting Miniflare takes about half a second.

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../migrations')
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
export const TEST_TEAM_PASSWORD = 'team-password-for-tests'

/** Call at the top of a test file; read `env` inside tests. */
export function useTestDatabase(): { readonly env: Bindings } {
  let miniflare: Miniflare | undefined
  let database: D1Database | undefined
  const holder = {
    get env(): Bindings {
      if (!database) throw new Error('The test database is not ready yet')
      return { DB: database, TEAM_PASSWORD: TEST_TEAM_PASSWORD }
    },
  }

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch: () => new Response(null) }',
      d1Databases: { DB: 'test-db' },
    })
    database = (await miniflare.getD1Database('DB')) as unknown as D1Database
    for (const statement of migrationStatements()) await database.prepare(statement).run()
  })
  beforeEach(async () => {
    if (database) await emptyAllTables(database)
  })
  afterAll(() => miniflare?.dispose())

  return holder
}

async function emptyAllTables(database: D1Database): Promise<void> {
  const { results } = await database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    )
    .all<{ name: string }>()
  await database.batch([
    database.prepare('PRAGMA defer_foreign_keys = ON'),
    ...results.map((table) => database.prepare(`DELETE FROM "${table.name}"`)),
    database.prepare('DELETE FROM sqlite_sequence'),
  ])
}

function migrationStatements(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  return files.flatMap((file) =>
    readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      .split(STATEMENT_BREAKPOINT)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
  )
}
