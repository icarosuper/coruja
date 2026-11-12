import { asc, eq } from 'drizzle-orm'
import { generateToken, hashToken } from '../auth'
import type { Database } from '../db/client'
import { balanceAdjustments, devs } from '../db/schema'
import { ApiError } from '../errors'
import { balancesBefore } from './balances'

/** Nicknames match the sheet's cells ignoring case, accents' encoding form and surrounding spaces. */
export function normalizeNickname(nickname: string): string {
  return nickname.normalize('NFC').trim().toLocaleLowerCase('pt-BR')
}

export async function listDevs(database: Database) {
  const [rows, balances] = await Promise.all([
    database.select().from(devs).orderBy(asc(devs.nickname)),
    balancesBefore(database, null),
  ])
  return rows.map((dev) => ({
    id: dev.id,
    nickname: dev.nickname,
    weight: dev.weight,
    active: dev.active,
    hasToken: dev.tokenHash !== null,
    balance: balances.get(dev.id) ?? 0,
  }))
}

/**
 * Adds a dev and issues their token (shown once). The new dev starts at the active team's average
 * balance (decisions #19), recorded as a `joined` adjustment.
 */
export async function createDev(database: Database, input: { nickname: string; weight: number }) {
  const nickname = input.nickname.normalize('NFC').trim()
  await ensureNicknameIsFree(database, nickname, null)

  const [activeDevs, balances] = await Promise.all([
    database.select({ id: devs.id }).from(devs).where(eq(devs.active, true)),
    balancesBefore(database, null),
  ])
  const averageBalance =
    activeDevs.length === 0
      ? 0
      : activeDevs.reduce((sum, dev) => sum + (balances.get(dev.id) ?? 0), 0) / activeDevs.length

  const token = generateToken()
  const [dev] = await database
    .insert(devs)
    .values({ nickname, weight: input.weight, tokenHash: await hashToken(token) })
    .returning()
  if (!dev) throw new Error('Insert returned no dev')

  const hasStartingBalance = averageBalance !== 0
  if (hasStartingBalance) {
    await database
      .insert(balanceAdjustments)
      .values({ devId: dev.id, hours: averageBalance, reason: 'joined', monthId: null })
  }
  return { dev: { id: dev.id, nickname: dev.nickname, weight: dev.weight }, token }
}

/** Replaces the dev's token: the old one stops working at once. */
export async function issueToken(database: Database, devId: number): Promise<string> {
  await findDev(database, devId)
  const token = generateToken()
  await database
    .update(devs)
    .set({ tokenHash: await hashToken(token) })
    .where(eq(devs.id, devId))
  return token
}

export async function setWeight(database: Database, devId: number, weight: number): Promise<void> {
  await findDev(database, devId)
  await database.update(devs).set({ weight }).where(eq(devs.id, devId))
}

/** Rename or (de)activate. A deactivated dev keeps their history and is never scheduled (#19). */
export async function updateDev(
  database: Database,
  devId: number,
  changes: { nickname?: string | undefined; active?: boolean | undefined },
): Promise<void> {
  const dev = await findDev(database, devId)
  const nickname = changes.nickname?.normalize('NFC').trim()
  if (nickname !== undefined) await ensureNicknameIsFree(database, nickname, devId)

  const isDeactivating = changes.active === false && dev.active
  const isReactivating = changes.active === true && !dev.active
  const values = {
    ...(nickname === undefined ? {} : { nickname }),
    ...(isDeactivating ? { active: false, deactivatedAt: new Date() } : {}),
    ...(isReactivating ? { active: true, deactivatedAt: null } : {}),
  }
  const hasChanges = Object.keys(values).length > 0
  if (hasChanges) await database.update(devs).set(values).where(eq(devs.id, devId))
}

async function findDev(database: Database, devId: number) {
  const dev = await database.query.devs.findFirst({ where: eq(devs.id, devId) })
  if (!dev) throw new ApiError(404, 'dev_not_found')
  return dev
}

async function ensureNicknameIsFree(database: Database, nickname: string, ownDevId: number | null) {
  const allDevs = await database.select({ id: devs.id, nickname: devs.nickname }).from(devs)
  const wanted = normalizeNickname(nickname)
  const isTaken = allDevs.some((dev) => dev.id !== ownDevId && normalizeNickname(dev.nickname) === wanted)
  if (isTaken) throw new ApiError(409, 'nickname_taken')
}

/** Dev ids for nicknames as written in the sheet; unknown nicknames come back separately. */
export async function resolveNicknames(database: Database, nicknames: Iterable<string>) {
  const allDevs = await database.select({ id: devs.id, nickname: devs.nickname }).from(devs)
  const idByNickname = new Map(allDevs.map((dev) => [normalizeNickname(dev.nickname), dev.id]))
  const found = new Map<string, number>()
  const unknown: string[] = []
  for (const nickname of new Set(nicknames)) {
    const devId = idByNickname.get(normalizeNickname(nickname))
    if (devId === undefined) unknown.push(nickname)
    else found.set(nickname, devId)
  }
  return { found, unknown: unknown.sort() }
}
