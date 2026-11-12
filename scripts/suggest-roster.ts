// Runs the scheduler on a team described in a JSON file and prints the suggested month, so it can be
// tried by hand before there is an API or a screen. Usage:
//
//   bun run suggest scripts/example-team.json
//
// File format: see scripts/example-team.json. Rules are weekdays ("sun"…"sat") or days of the month
// (1–31). Keep files with the real team as `*.local.json` (gitignored): real names stay out of the repo.

import { daysOfMonth, type IsoDate, weekdayOf } from '../src/schedule/dates'
import { type Preference, type PreferenceRule, preferenceOn } from '../src/schedule/preferences'
import { type SchedulerDev, suggestRoster } from '../src/schedule/scheduler'
import { type DayKind, defaultCalendar, monthlyHoursByDev, type ShiftDay } from '../src/schedule/shifts'

type RuleValue = string | number

type TeamFile = {
  month: string
  /** The previous month's last shift (it runs into day 1). Optional. */
  previousDay?: { date: IsoDate; kind: DayKind; nickname: string }
  /** Days whose kind differs from the holiday calendar, e.g. `{ "2026-12-24": "day_off" }`. */
  dayKinds?: Record<IsoDate, DayKind>
  devs: Array<{
    nickname: string
    weight?: number
    balance?: number
    cant?: RuleValue[]
    avoid?: RuleValue[]
    good?: RuleValue[]
    absences?: Array<[IsoDate, IsoDate]>
  }>
}

const WEEKDAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function toRule(value: RuleValue, preference: Preference): PreferenceRule {
  if (typeof value === 'number') return { kind: 'month_day', value, preference }
  const weekday = WEEKDAY_NAMES.indexOf(value.toLowerCase())
  if (weekday < 0)
    throw new Error(`Unknown weekday "${value}": use ${WEEKDAY_NAMES.join(', ')} or a day number`)
  return { kind: 'weekday', value: weekday, preference }
}

function toSchedulerDev(dev: TeamFile['devs'][number]): SchedulerDev<string> {
  const rulesOf = (values: RuleValue[] | undefined, preference: Preference) =>
    (values ?? []).map((value) => toRule(value, preference))
  return {
    id: dev.nickname,
    weight: dev.weight ?? 100,
    balance: dev.balance ?? 0,
    rules: [...rulesOf(dev.cant, 'cant'), ...rulesOf(dev.avoid, 'avoid'), ...rulesOf(dev.good, 'good')],
    absences: (dev.absences ?? []).map(([fromDate, toDate]) => ({ fromDate, toDate })),
  }
}

const filePath = Bun.argv[2]
if (!filePath) {
  console.error('Usage: bun run suggest <team.json>')
  process.exit(1)
}
const team: TeamFile = await Bun.file(filePath).json()
const devs = team.devs.map(toSchedulerDev)
const calendar = defaultCalendar(team.month).map((day) => ({
  ...day,
  kind: team.dayKinds?.[day.date] ?? day.kind,
}))
const previousDay: ShiftDay<string> | null = team.previousDay
  ? {
      date: team.previousDay.date,
      kind: team.previousDay.kind,
      segments: [
        {
          devId: team.previousDay.nickname,
          fromHour: 0,
          toHour: team.previousDay.kind === 'day_off' ? 24 : 15,
        },
      ],
    }
  : null

const startedAt = performance.now()
const suggestion = suggestRoster({ month: team.month, calendar, previousDay, devs })
const elapsedMilliseconds = performance.now() - startedAt

printCalendar()
printTotals()
if (suggestion.unassignedDates.length > 0) {
  console.log(`\nNobody can take: ${suggestion.unassignedDates.join(', ')}`)
}
console.log(`\nComputed in ${elapsedMilliseconds.toFixed(1)} ms`)

function ownerOn(date: IsoDate): string | undefined {
  return suggestion.days.find((day) => day.date === date)?.segments[0]?.devId
}

function preferenceOf(nickname: string, date: IsoDate): Preference | null {
  const dev = devs.find((candidate) => candidate.id === nickname)
  return dev ? preferenceOn(date, dev.rules, dev.absences) : null
}

/** One line per week. `*` = 24h day, `+` = a good day for that dev, `-` = an avoid day, `!` = nobody. */
function printCalendar(): void {
  const width = Math.max(...devs.map((dev) => dev.id.length)) + 5
  const header = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => name.padEnd(width)).join(' ')
  console.log(`\n${team.month}\n\n${header}`)

  const dates = daysOfMonth(team.month)
  let line = ' '.repeat((width + 1) * weekdayOf(dates[0] ?? ''))
  for (const date of dates) {
    const kind = calendar.find((day) => day.date === date)?.kind
    const owner = ownerOn(date)
    const preference = owner ? preferenceOf(owner, date) : null
    const preferenceMark = preference === 'good' ? '+' : preference === 'avoid' ? '-' : ''
    const label = `${date.slice(8)}${kind === 'day_off' ? '*' : ' '}${owner ?? '!'}${preferenceMark}`
    line += `${label.padEnd(width)} `
    const isSaturday = weekdayOf(date) === 6
    if (isSaturday) {
      console.log(line.trimEnd())
      line = ''
    }
  }
  if (line.trim()) console.log(line.trimEnd())
}

/** Hours against the weighted share, and how each goal went per dev. */
function printTotals(): void {
  const hours = monthlyHoursByDev(
    team.month,
    previousDay ? [previousDay, ...suggestion.days] : suggestion.days,
  )
  const totalHours = [...hours.values()].reduce((sum, value) => sum + value, 0)
  const totalWeight = devs.reduce((sum, dev) => sum + dev.weight, 0)
  const rows = devs.map((dev) => {
    const ownDays = suggestion.days.filter((day) => day.segments[0]?.devId === dev.id)
    const share = totalWeight > 0 ? (dev.weight / totalWeight) * totalHours : 0
    const devHours = hours.get(dev.id) ?? 0
    const backToBack = suggestion.days.filter((day, index) => {
      const previousOwner = suggestion.days[index - 1]?.segments[0]?.devId
      return day.segments[0]?.devId === dev.id && previousOwner === dev.id
    }).length
    return {
      dev: dev.id,
      weight: `${dev.weight}%`,
      hours: devHours,
      share: Number(share.toFixed(1)),
      'month diff': Number((devHours - share).toFixed(1)),
      'new balance': Number((dev.balance + devHours - share).toFixed(1)),
      '24h days': ownDays.filter((day) => day.kind === 'day_off').length,
      good: ownDays.filter((day) => preferenceOf(dev.id, day.date) === 'good').length,
      avoid: ownDays.filter((day) => preferenceOf(dev.id, day.date) === 'avoid').length,
      'back-to-back': backToBack,
    }
  })
  console.log(`\nTotal: ${totalHours}h\n`)
  console.table(rows)
}
