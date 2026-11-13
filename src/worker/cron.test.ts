import { beforeEach, describe, expect, it } from 'vitest'
import { openDueMonths } from './cron'
import { createDatabase } from './db/client'
import { addDevs, asDev, clientFor } from './testing/client'
import { useTestDatabase } from './testing/env'

const database = useTestDatabase()
let token = ''
beforeEach(async () => {
  const devs = await addDevs(database.env, [{ nickname: 'owl' }, { nickname: 'hawk' }])
  token = devs.get('owl')?.token ?? ''
})

const openByHand = (month: string) =>
  clientFor(database.env).api.months[':month'].open.$post({ param: { month } }, asDev(token))
const monthIds = async () =>
  (await (await clientFor(database.env).api.months.$get({}, asDev(token))).json()).map((month) => month.id)

describe('openDueMonths', () => {
  it('opens the next month on the 20th, once, logged as Coruja', async () => {
    await openByHand('2026-11')
    const db = createDatabase(database.env.DB)

    expect(await openDueMonths(db, '2026-11-19')).toEqual([])
    expect(await openDueMonths(db, '2026-11-20')).toEqual(['2026-12'])
    expect(await openDueMonths(db, '2026-11-21')).toEqual([])
    expect(await monthIds()).toEqual(['2026-12', '2026-11'])

    const log = await (
      await clientFor(database.env).api.months[':month'].log.$get(
        { param: { month: '2026-12' } },
        asDev(token),
      )
    ).json()
    expect(log).toMatchObject([{ action: 'generate', actorNickname: null }])
  })

  it('catches up on months a missed run left behind', async () => {
    await openByHand('2026-11')
    expect(await openDueMonths(createDatabase(database.env.DB), '2027-01-02')).toEqual(['2026-12', '2027-01'])
  })

  it('opens nothing before the first month exists', async () => {
    expect(await openDueMonths(createDatabase(database.env.DB), '2026-11-20')).toEqual([])
    expect(await monthIds()).toEqual([])
  })
})
