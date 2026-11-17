// Empties the PR previews' database and fills it with a made-up team and an open month (decisions
// #33), so every preview has something to click. Usage, with the previews' team password:
//
//   TEAM_PASSWORD=... bun run staging:seed https://<branch>-coruja.<subdomain>.workers.dev
//
// The database is emptied with wrangler (wrangler.staging.jsonc); the team is created through the
// preview's own API, so it goes through the same rules as real data. Prints each dev's token: they
// exist only in this terminal and in the staging database. Made-up nicknames only.

import { saoPauloDate } from '../src/schedule/calendar'
import { monthOf } from '../src/schedule/dates'

const STAGING_DATABASE = 'coruja-staging'
const STAGING_CONFIG = 'wrangler.staging.jsonc'

type FakeDev = {
  nickname: string
  weight: number
  /** Weekday (0 = Sunday) → preference. */
  rules?: Record<number, 'good' | 'avoid' | 'cant'>
}

const TEAM: FakeDev[] = [
  { nickname: 'owl', weight: 100, rules: { 0: 'cant', 4: 'good' } },
  { nickname: 'hawk', weight: 100, rules: { 6: 'avoid' } },
  { nickname: 'kite', weight: 100 },
  { nickname: 'wren', weight: 50, rules: { 1: 'good', 5: 'avoid' } },
  { nickname: 'heron', weight: 100, rules: { 3: 'cant' } },
  { nickname: 'finch', weight: 100 },
]

async function wrangler(args: string[]): Promise<string> {
  const child = Bun.spawn(['bunx', 'wrangler', ...args, '-c', STAGING_CONFIG], {
    stdout: 'pipe',
    stderr: 'inherit',
  })
  const output = await new Response(child.stdout).text()
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`wrangler ${args.join(' ')} failed (${exitCode})`)
  return output
}

/** Deletes every row of every table but the migrations' own, so the schema stays as migrated. */
async function emptyStagingDatabase(): Promise<void> {
  const listed = await wrangler([
    'd1',
    'execute',
    STAGING_DATABASE,
    '--remote',
    '--json',
    '--command',
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
  ])
  const [answer] = JSON.parse(listed) as Array<{ results: Array<{ name: string }> }>
  const tables = answer?.results.map((row) => row.name) ?? []
  const deletes = tables.map((table) => `DELETE FROM "${table}";`).join(' ')
  await wrangler([
    'd1',
    'execute',
    STAGING_DATABASE,
    '--remote',
    '--command',
    `PRAGMA defer_foreign_keys = on; ${deletes} DELETE FROM sqlite_sequence;`,
  ])
}

function client(baseUrl: string, teamPassword: string) {
  return async function request(method: string, path: string, body: unknown, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    else headers['X-Team-Password'] = teamPassword
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const answer = await response.json()
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(answer)}`)
    return answer
  }
}

async function seed(baseUrl: string, teamPassword: string): Promise<void> {
  const request = client(baseUrl, teamPassword)
  const tokens = new Map<string, string>()
  for (const dev of TEAM) {
    const created = (await request('POST', '/devs', { nickname: dev.nickname, weight: dev.weight })) as {
      dev: { id: number }
      token: string
    }
    tokens.set(dev.nickname, created.token)
    const rules = Object.entries(dev.rules ?? {}).map(([weekday, preference]) => ({
      kind: 'weekday',
      value: Number(weekday),
      preference,
    }))
    if (rules.length > 0) await request('PUT', `/devs/${created.dev.id}/rules`, { rules })
  }

  const currentMonth = monthOf(saoPauloDate(new Date()))
  const firstToken = tokens.get(TEAM[0]?.nickname ?? '') ?? ''
  await request('POST', `/months/${currentMonth}/open`, undefined, firstToken)

  console.log(`Staging seeded: ${TEAM.length} devs, ${currentMonth} open. Tokens:`)
  for (const [nickname, token] of tokens) console.log(`  ${nickname.padEnd(6)} ${token}`)
}

const baseUrl = process.argv[2]?.replace(/\/+$/, '')
const teamPassword = process.env.TEAM_PASSWORD
if (!baseUrl || !teamPassword) {
  console.error('Usage: TEAM_PASSWORD=<previews team password> bun run staging:seed <preview URL>')
  process.exit(1)
}
await emptyStagingDatabase()
await seed(baseUrl, teamPassword)
