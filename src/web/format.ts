import type { IsoDate, MonthId } from '../schedule/dates'
import type { Preference } from '../schedule/preferences'
import { type DayKind, shiftStartHour } from '../schedule/shifts'

// How things read on screen, in Portuguese.

export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** "dezembro de 2026" */
export const monthName = (month: MonthId) =>
  `${MONTH_NAMES[Number(month.slice(5)) - 1]} de ${month.slice(0, 4)}`
/** "Dezembro de 2026" */
export const monthTitle = (month: MonthId) => {
  const name = monthName(month)
  return name.charAt(0).toUpperCase() + name.slice(1)
}
/** "05/12" */
export const dayLabel = (date: IsoDate) => `${date.slice(8)}/${date.slice(5, 7)}`
/** "05/12/2026" */
export const fullDate = (date: IsoDate) => `${dayLabel(date)}/${date.slice(0, 4)}`

/** "18h", "09h": the clock time `hour` hours into a shift of `kind`. */
export const clock = (kind: DayKind, hour: number) =>
  `${String((shiftStartHour(kind) + hour) % 24).padStart(2, '0')}h`
export const segmentLabel = (kind: DayKind, fromHour: number, toHour: number) =>
  `${clock(kind, fromHour)}–${clock(kind, toHour)}`

const decimal = (value: number) => value.toFixed(1).replace('.0', '').replace('.', ',')
export const formatHours = (hours: number) => `${decimal(hours)}h`
export const formatBalance = (hours: number) => {
  const isZero = Math.abs(hours) < 0.05
  if (isZero) return '0h'
  return `${hours > 0 ? '+' : ''}${decimal(hours)}h`
}

/** "13/11 14:02" in São Paulo time. */
const TIMESTAMP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
export const formatTimestamp = (milliseconds: number) => TIMESTAMP.format(milliseconds).replace(',', '')

/** One wording everywhere: first person on my profile, third person when looking at someone else. */
export const PREFERENCE_TEXT: Record<Preference, { mine: string; theirs: string; icon: string }> = {
  good: { mine: 'Prefiro', theirs: 'prefere', icon: '✓' },
  avoid: { mine: 'Evito', theirs: 'evita', icon: '~' },
  cant: { mine: 'Não posso', theirs: 'não pode', icon: '✕' },
}
export const NEUTRAL_TEXT = '—'

// Each colour family here has its dark-mode scale in app.css.
const DEV_COLORS = [
  'bg-sky-200 text-sky-950',
  'bg-amber-200 text-amber-950',
  'bg-emerald-200 text-emerald-950',
  'bg-rose-200 text-rose-950',
  'bg-violet-200 text-violet-950',
  'bg-lime-200 text-lime-950',
  'bg-orange-200 text-orange-950',
]
/** A dev keeps the same colour on every screen. */
export const colorOf = (devId: number) => DEV_COLORS[(devId - 1) % DEV_COLORS.length] ?? ''
