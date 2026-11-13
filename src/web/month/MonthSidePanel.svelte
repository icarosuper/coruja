<script lang="ts">
  // Hours and balance per dev, and the month's change log (decisions #21).
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import type { DayKind } from '../../schedule/shifts'
  import { colorOf, dayLabel, formatBalance, formatHours, formatTimestamp, segmentLabel } from '../format'
  import type { Dev, LogEntry, MonthView } from './types'

  type Props = { view: MonthView; log: LogEntry[]; devs: Dev[] }
  let { view, log, devs }: Props = $props()

  const rows = $derived([
    ...view.participants.map((participant) => ({ ...participant, isOutsider: false })),
    ...view.outsiders.map((outsider) => ({
      ...outsider,
      weight: 0,
      expectedHours: 0,
      confirmed: true,
      isOutsider: true,
    })),
  ])

  type LoggedDay = { kind: DayKind; segments: { devId: number; fromHour: number; toHour: number }[] }
  const nicknameOf = (devId: number) => devs.find((dev) => dev.id === devId)?.nickname ?? '?'
  const describeDay = (day: LoggedDay) =>
    day.segments
      .map(
        (segment) =>
          `${nicknameOf(segment.devId)} ${segmentLabel(day.kind, segment.fromHour, segment.toHour)}`,
      )
      .join(', ') || 'ninguém'

  /** The log entry as a sentence, in Portuguese. */
  function describe(entry: LogEntry): string {
    const after = entry.after as LoggedDay & { format?: string; unassignedDates?: string[] }
    const before = entry.before as LoggedDay | null
    const date = entry.date ? dayLabel(entry.date) : ''
    const kindNote =
      before && before.kind !== after.kind ? ` (virou ${after.kind === 'day_off' ? '24h' : '15h'})` : ''
    switch (entry.action) {
      case 'generate': {
        const holes = after?.unassignedDates?.length ?? 0
        return `abriu o mês com a escala sugerida${holes > 0 ? ` (${holes} sem ninguém)` : ''}`
      }
      case 'assign':
      case 'split':
      case 'day_kind':
        return `mudou ${date}: ${describeDay(after)}${kindNote}`
      case 'sync':
        return `trouxe da planilha ${date}: ${describeDay(after)}${kindNote}`
      case 'confirm':
        return 'confirmou'
      case 'unconfirm':
        return 'desfez a confirmação'
      case 'export':
        return after?.format === 'paste_grid' ? 'exportou (tabela do Excel)' : 'exportou (Office Script)'
      case 'import':
        return 'importou o mês da planilha'
      default:
        return entry.action
    }
  }
</script>

<aside class="rounded-xl border border-stone-200 bg-white p-4">
  <Tabs.Root value="hours" class="flex-col">
    <Tabs.List variant="line" class="mb-1">
      <Tabs.Trigger value="hours">Horas e saldo</Tabs.Trigger>
      <Tabs.Trigger value="log">Histórico</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="hours">
      <table class="w-full text-[15px]">
        <thead class="text-left text-xs text-stone-500">
          <tr>
            <th class="py-1 font-normal">Dev</th>
            <th class="py-1 text-right font-normal">Horas</th>
            <th class="py-1 text-right font-normal" title="Parte esperada pelo peso">Esperado</th>
            <th class="py-1 text-right font-normal" title="Saldo acumulado depois deste mês">Saldo</th>
            <th class="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.devId)}
            <tr class="border-t border-stone-100">
              <td class="py-2">
                <span
                  class="inline-block max-w-32 truncate rounded-md px-2 py-0.5 align-middle text-sm font-medium {colorOf(
                    row.devId,
                  )}"
                  >{row.nickname}</span
                >
                {#if !row.isOutsider && row.weight !== 100}
                  <span class="text-xs text-stone-400">{row.weight}%</span>
                {/if}
              </td>
              <td class="text-right tabular-nums">{formatHours(row.hours)}</td>
              <td class="text-right text-stone-500 tabular-nums">{formatHours(row.expectedHours)}</td>
              <td
                class="text-right tabular-nums {row.balanceAfter > 0.05
                  ? 'text-sky-700'
                  : row.balanceAfter < -0.05
                    ? 'text-rose-700'
                    : ''}"
              >
                {formatBalance(row.balanceAfter)}
              </td>
              <td class="pl-2 text-center" title={row.confirmed ? 'confirmou' : 'falta confirmar'}>
                {#if row.isOutsider}
                  <span class="text-xs text-stone-400">de fora</span>
                {:else if row.confirmed}
                  <span class="text-emerald-600">✓</span>
                {:else}
                  <span class="text-stone-300">○</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="mt-2 text-xs text-stone-500">
        Saldo positivo = fez mais que a parte dele; o próximo mês compensa.
      </p>
    </Tabs.Content>
    <Tabs.Content value="log">
      <ol class="space-y-1.5 text-sm">
        {#each log as entry (entry.id)}
          <li class="flex gap-2">
            <span class="w-24 shrink-0 text-stone-400 tabular-nums">{formatTimestamp(entry.createdAt)}</span>
            <span><b class="font-medium">{entry.actorNickname ?? 'Coruja'}</b> {describe(entry)}</span>
          </li>
        {:else}
          <li class="text-stone-500">Nada ainda.</li>
        {/each}
      </ol>
    </Tabs.Content>
  </Tabs.Root>
</aside>
