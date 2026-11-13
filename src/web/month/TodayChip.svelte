<script lang="ts">
  // Who is on call today; a link to today's month when another month is on screen.
  import { monthOf } from '../../schedule/dates'
  import { colorOf, dayLabel, segmentLabel } from '../format'
  import { links } from '../router.svelte'
  import type { MonthView } from './types'

  type Props = { date: string; todayView: MonthView | null; month: string }
  let { date, todayView, month }: Props = $props()

  const today = $derived(todayView?.days.find((day) => day.date === date) ?? null)
  const isTodayInView = $derived(monthOf(date) === month)
</script>

{#if today}
  <a
    href={links.month(monthOf(date))}
    class="inline-flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm text-sky-950 {isTodayInView
      ? 'pointer-events-none'
      : 'hover:border-sky-400'}"
  >
    <span class="font-semibold">Hoje, {dayLabel(date)}:</span>
    {#each today.segments as segment, index (index)}
      <span class="rounded-md px-2 py-0.5 font-medium {colorOf(segment.devId)}">{segment.nickname}</span>
      <span class="text-sky-800">{segmentLabel(today.kind, segment.fromHour, segment.toHour)}</span>
    {:else}
      <span>ninguém</span>
    {/each}
    {#if !isTodayInView}
      <span class="text-sky-700">→ ver</span>
    {/if}
  </a>
{/if}
