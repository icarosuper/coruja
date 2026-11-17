import { addDays, type IsoDate, type MonthId, weekdayOf } from '../../schedule/dates'
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

const HOURS_PER_DAY = 24

/** How many days after the shift's day, and the clock, of an hour counted from the shift start. */
function momentOf(kind: DayKind, hourOfShift: number) {
  const hourOfDay = shiftStartHour(kind) + hourOfShift
  return {
    daysLater: Math.floor(hourOfDay / HOURS_PER_DAY),
    clock: `${String(hourOfDay % HOURS_PER_DAY).padStart(2, '0')}:00`,
  }
}

/** "18:00", or "09:00 de sex 11/12" when the hour falls on another day than the shift's. */
function momentText(date: IsoDate, kind: DayKind, hourOfShift: number): string {
  const { daysLater, clock } = momentOf(kind, hourOfShift)
  return daysLater === 0 ? clock : `${clock} de ${dayText(addDays(date, daysLater))}`
}

/** "das 18:00 às 09:00 de sex 11/12"; the day is said once when both ends fall on it. */
function rangeText(date: IsoDate, kind: DayKind, segment: Segment<number>): string {
  const start = momentOf(kind, segment.fromHour)
  const end = momentOf(kind, segment.toHour)
  const isSameDay = start.daysLater === end.daysLater
  const from = isSameDay ? start.clock : momentText(date, kind, segment.fromHour)
  return `das ${from} às ${momentText(date, kind, segment.toHour)}`
}

/** "das 18:00 às 09:00 de sex 11/12 (15h)"; a split shift lists each part and the share it is. */
export function shiftText(date: IsoDate, kind: DayKind, segments: Segment<number>[]): string {
  const ranges = segments.map((segment) => rangeText(date, kind, segment))
  const hours = segments.reduce((sum, segment) => sum + segment.toHour - segment.fromHour, 0)
  const isWholeShift = hours === shiftLength(kind)
  const total = isWholeShift ? `${hours}h` : `${hours}h de ${shiftLength(kind)}h`
  return `${ranges.join(' e ')} (${total})`
}

export function reminderText(reminder: Reminder) {
  const { date, dayKind, segments } = reminder
  const day = dayText(date)
  switch (reminder.kind) {
    case 'eve':
      return {
        title: 'Sobreaviso amanhã',
        message: `Amanhã (${day}) você está de sobreaviso ${shiftText(date, dayKind, segments)}.`,
      }
    case 'day':
      return {
        title: 'Sobreaviso hoje',
        message: `Hoje (${day}) você está de sobreaviso ${shiftText(date, dayKind, segments)}.`,
      }
    case 'shift_start': {
      const started = segments.find((segment) => segment.fromHour === reminder.fromHour)
      const until = momentText(date, dayKind, started?.toHour ?? shiftLength(dayKind))
      return { title: 'Seu sobreaviso começou', message: `Você está de sobreaviso agora, até ${until}.` }
    }
  }
}

/** One line per day of the dev's that changed: their part of the shift now, or that they left it. */
export function shiftChangeText(
  changes: Array<{ date: IsoDate; kind: DayKind; segments: Segment<number>[] }>,
  actorNickname: string | null,
) {
  const lines = changes.map((change) => {
    const isStillOnShift = change.segments.length > 0
    const now = isStillOnShift
      ? `agora você está de sobreaviso ${shiftText(change.date, change.kind, change.segments)}`
      : 'você não está mais de sobreaviso'
    return `• ${dayText(change.date)}: ${now}`
  })
  const intro = actorNickname ? `${actorNickname} mudou seus turnos:` : 'Seus turnos mudaram:'
  return { title: 'Sua escala mudou', message: [intro, ...lines].join('\n') }
}

export function monthOpenedText(month: MonthId, actorNickname: string, isRegenerated: boolean) {
  const name = monthText(month)
  return isRegenerated
    ? {
        title: `Escala de ${name} gerada de novo`,
        message: `${actorNickname} gerou a escala de ${name} de novo. Confira seus turnos e confirme no Coruja.`,
      }
    : {
        title: `Escala de ${name} aberta`,
        message: `${actorNickname} abriu a escala de ${name}. Confira seus turnos e confirme no Coruja.`,
      }
}

export const TEST_TEXT = {
  title: 'Coruja',
  message: 'As notificações estão funcionando. Os avisos dos seus turnos de sobreaviso chegam aqui.',
}
