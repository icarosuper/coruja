import { type IsoDate, type MonthId, weekdayOf } from '../../schedule/dates'
import type { Reminder } from '../../schedule/reminders'
import { type DayKind, type Segment, shiftLength, shiftStartHour } from '../../schedule/shifts'

// What the notifications say. Portuguese: the devs read them on their phones.

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
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

/** "qua 10/12" */
export function dayText(date: IsoDate): string {
  return `${WEEKDAYS[weekdayOf(date)]} ${date.slice(8)}/${date.slice(5, 7)}`
}

/** "dezembro" */
export function monthText(month: MonthId): string {
  return MONTH_NAMES[Number(month.slice(5)) - 1] ?? month
}

function clockText(kind: DayKind, hour: number): string {
  return `${String((shiftStartHour(kind) + hour) % 24).padStart(2, '0')}:00`
}

/** "18:00 → 09:00 (15h)", or "18:00 → 23:00 e 04:00 → 09:00" for a split shift. */
export function shiftText(kind: DayKind, segments: Segment<number>[]): string {
  const ranges = segments.map(
    (segment) => `${clockText(kind, segment.fromHour)} → ${clockText(kind, segment.toHour)}`,
  )
  const hours = segments.reduce((sum, segment) => sum + segment.toHour - segment.fromHour, 0)
  const isWholeShift = hours === shiftLength(kind)
  return isWholeShift
    ? `${ranges.join(' e ')} (${hours}h)`
    : `${ranges.join(' e ')} (${hours}h de ${shiftLength(kind)}h)`
}

const REMINDER_TITLES: Record<Reminder['kind'], string> = {
  eve: 'Sobreaviso amanhã',
  day: 'Sobreaviso hoje',
  shift_start: 'Seu sobreaviso começou',
}

export function reminderText(reminder: Reminder) {
  return {
    title: REMINDER_TITLES[reminder.kind],
    message: `${dayText(reminder.date)}: ${shiftText(reminder.dayKind, reminder.segments)}`,
  }
}

/** One line per day of the dev's that changed: their part of the shift now, or that they left it. */
export function shiftChangeText(
  changes: Array<{ date: IsoDate; kind: DayKind; segments: Segment<number>[] }>,
  actorNickname: string | null,
) {
  const lines = changes.map((change) => {
    const isStillOnShift = change.segments.length > 0
    const now = isStillOnShift ? shiftText(change.kind, change.segments) : 'você saiu da escala'
    return `${dayText(change.date)}: ${now}`
  })
  if (actorNickname) lines.push(`Mudança feita por ${actorNickname}.`)
  return { title: 'Sua escala mudou', message: lines.join('\n') }
}

export function monthOpenedText(month: MonthId, actorNickname: string, isRegenerated: boolean) {
  const action = isRegenerated ? 'gerada de novo' : 'aberta'
  return {
    title: `Escala de ${monthText(month)} ${action}`,
    message: `${actorNickname} ${isRegenerated ? 'gerou a escala de novo' : 'abriu o mês'}. Confira seus turnos e confirme.`,
  }
}

export const TEST_TEXT = { title: 'Coruja', message: 'As notificações estão funcionando.' }
