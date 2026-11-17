import { describe, expect, it } from 'vitest'
import type { Reminder } from '../../schedule/reminders'
import { monthOpenedText, reminderText, shiftChangeText } from './messages'

const OWL = 1
const reminder = (overrides: Partial<Reminder>): Reminder => ({
  devId: OWL,
  date: '2026-12-12',
  dayKind: 'day_off',
  kind: 'day',
  fromHour: 0,
  dueAt: 0,
  segments: [{ devId: OWL, fromHour: 0, toHour: 24 }],
  ...overrides,
})

describe('reminderText', () => {
  it('says the day and when the shift ends, on the next day', () => {
    expect(reminderText(reminder({}))).toEqual({
      title: 'Sobreaviso hoje',
      message: 'Hoje (sáb 12/12) você está de sobreaviso das 09:00 às 09:00 de dom 13/12 (24h).',
    })
  })

  it('lists each part of a split shift with the day of the hours after midnight', () => {
    const split = reminder({
      kind: 'eve',
      date: '2026-12-10',
      dayKind: 'workday',
      segments: [
        { devId: OWL, fromHour: 0, toHour: 5 },
        { devId: OWL, fromHour: 10, toHour: 15 },
      ],
    })
    expect(reminderText(split).message).toBe(
      'Amanhã (qui 10/12) você está de sobreaviso das 18:00 às 23:00 e das 04:00 às 09:00 de sex 11/12 (10h de 15h).',
    )
  })

  it('says until when, when the dev’s part starts', () => {
    const started = reminder({
      kind: 'shift_start',
      date: '2026-12-10',
      dayKind: 'workday',
      fromHour: 0,
      segments: [{ devId: OWL, fromHour: 0, toHour: 5 }],
    })
    expect(reminderText(started)).toEqual({
      title: 'Seu sobreaviso começou',
      message: 'Você está de sobreaviso agora, até 23:00.',
    })
  })
})

describe('event texts', () => {
  it('lists the changed days under who changed them', () => {
    const text = shiftChangeText(
      [
        { date: '2026-12-10', kind: 'workday', segments: [{ devId: OWL, fromHour: 0, toHour: 15 }] },
        { date: '2026-12-11', kind: 'workday', segments: [] },
      ],
      'hawk',
    )
    expect(text.message).toBe(
      'hawk mudou seus turnos:\n' +
        '• qui 10/12: agora você está de sobreaviso das 18:00 às 09:00 de sex 11/12 (15h)\n' +
        '• sex 11/12: você não está mais de sobreaviso',
    )
  })

  it('names the month and who opened it', () => {
    expect(monthOpenedText('2026-12', 'owl', false)).toEqual({
      title: 'Escala de dezembro aberta',
      message: 'owl abriu a escala de dezembro. Confira seus turnos e confirme no Coruja.',
    })
  })
})
