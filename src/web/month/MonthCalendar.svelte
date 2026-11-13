<script lang="ts">
  // The month as a 7-column grid from md up, and as a list of days on phones (no room for names).
  import { daysOfMonth, weekdayOf } from '../../schedule/dates'
  import { type DayKind, shiftLength } from '../../schedule/shifts'
  import { colorOf, segmentLabel, WEEKDAYS } from '../format'
  import type { MonthDay, MonthView } from './types'

  type Props = {
    view: MonthView
    onlyMine: boolean
    meId: number | null
    todayDate: string
    onEdit: (day: MonthDay) => void
  }
  let { view, onlyMine, meId, todayDate, onEdit }: Props = $props()

  const monthDates = $derived(daysOfMonth(view.id))
  const firstWeekday = $derived(weekdayOf(monthDates[0] ?? ''))
  const dayOn = (date: string) => view.days.find((day) => day.date === date) as MonthDay

  const isMine = (day: MonthDay) => day.segments.some((segment) => segment.devId === meId)
  const isToday = (day: MonthDay) => day.date === todayDate
  // Today's frame is 4px; a 7px ring under it shows 3px of green inside the blue.
  const MY_DAY_RING_INSIDE_TODAY_FRAME = 'relative z-10 ring-[7px] ring-emerald-500 ring-inset'

  /** Background and "highlight my days" look of a day, same in the grid and in the phone list. */
  const dayLook = (day: MonthDay) => {
    const background = day.holidayName ? 'bg-indigo-50' : day.kind === 'day_off' ? 'bg-stone-100' : 'bg-white'
    const highlight = !onlyMine
      ? ''
      : isMine(day)
        ? isToday(day)
          ? MY_DAY_RING_INSIDE_TODAY_FRAME
          : 'relative z-10 ring-2 ring-emerald-500 ring-inset'
        : 'opacity-25 grayscale'
    return `${background} ${highlight}`
  }
</script>

{#snippet dayNumber(day: MonthDay, size: string)}
  {#if isToday(day)}
    <span
      class="inline-grid min-w-7 place-items-center rounded-full bg-sky-600 px-1 font-semibold text-white {size}"
      title="Hoje"
      >{Number(day.date.slice(8))}</span
    >
  {:else}
    <span class="font-semibold {size} {day.holidayName ? 'text-indigo-700' : ''}"
      >{Number(day.date.slice(8))}</span
    >
  {/if}
{/snippet}

{#snippet todayFrame(day: MonthDay)}
  {#if isToday(day)}
    <span class="pointer-events-none absolute inset-0 z-20 border-4 border-sky-600" aria-hidden="true"></span>
  {/if}
{/snippet}

{#snippet todayLabel()}
  <span class="rounded bg-sky-600 px-1.5 py-0.5 text-[11px] leading-none font-bold tracking-wide text-white"
    >HOJE</span
  >
{/snippet}

{#snippet hoursBadge(kind: DayKind)}
  <span
    class="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums {kind === 'day_off'
      ? 'bg-stone-800 text-white'
      : 'bg-stone-200 text-stone-700'}"
    title={kind === 'day_off' ? 'Folga: 09h–09h' : 'Dia útil: 18h–09h'}
    >{kind === 'day_off' ? '24h' : '15h'}</span
  >
{/snippet}

{#snippet people(day: MonthDay)}
  {#each day.segments as segment, index (index)}
    <span class="truncate rounded-md px-2 py-1 text-sm font-medium {colorOf(segment.devId)}">
      {segment.nickname}
      {#if segment.toHour - segment.fromHour < shiftLength(day.kind)}
        <span class="font-normal opacity-70">{segmentLabel(day.kind, segment.fromHour, segment.toHour)}</span>
      {/if}
    </span>
  {:else}
    <span
      class="rounded-md border-2 border-dashed border-rose-500 bg-rose-100 px-2 py-1 text-sm font-semibold text-rose-700"
      >⚠ Ninguém</span
    >
  {/each}
{/snippet}

<div
  class="hidden grid-cols-7 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 md:grid"
>
  {#each WEEKDAYS as weekday (weekday)}
    <div class="bg-stone-100 py-2 text-center text-sm font-medium text-stone-500 uppercase">{weekday}</div>
  {/each}
  {#each Array.from({ length: firstWeekday }) as _, index (index)}
    <div class="bg-stone-50"></div>
  {/each}
  {#each monthDates as date (date)}
    {@const day = dayOn(date)}
    <button
      type="button"
      onclick={() => onEdit(day)}
      class="relative flex min-h-[max(6rem,calc((100dvh-22rem)/5))] flex-col gap-1.5 p-2 text-left transition hover:bg-sky-50 {dayLook(
        day,
      )}"
    >
      {@render todayFrame(day)}
      <div class="flex items-center gap-2">
        {@render dayNumber(day, 'text-base')}
        {#if isToday(day)}
          {@render todayLabel()}
        {/if}
        <span class="flex-1"></span>
        {@render hoursBadge(day.kind)}
      </div>
      {#if day.holidayName}
        <span
          class="line-clamp-2 text-xs leading-tight font-semibold text-indigo-700 italic hyphens-auto"
          title={day.holidayName}
          >✦ {day.holidayName}</span
        >
      {/if}
      {@render people(day)}
    </button>
  {/each}
</div>

<ol class="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 md:hidden">
  {#each monthDates as date (date)}
    {@const day = dayOn(date)}
    {@const startsWeek = weekdayOf(date) === 0 && date !== monthDates[0]}
    <li class={startsWeek ? 'border-t-4! border-stone-300!' : ''}>
      <button
        type="button"
        onclick={() => onEdit(day)}
        class="relative flex w-full items-start gap-3 px-3 py-2.5 text-left active:bg-sky-50 {dayLook(day)}"
      >
        {@render todayFrame(day)}
        <span class="w-11 shrink-0 text-center leading-tight">
          <span class="block text-[11px] font-medium text-stone-500 uppercase"
            >{WEEKDAYS[weekdayOf(date)]}</span
          >
          <span class="block">{@render dayNumber(day, 'text-xl')}</span>
          {#if isToday(day)}
            <span class="mt-1 block">{@render todayLabel()}</span>
          {/if}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          {#if day.holidayName}
            <span class="text-xs leading-tight font-semibold text-indigo-700 italic"
              >✦ {day.holidayName}</span
            >
          {/if}
          <span class="flex flex-wrap gap-1.5">{@render people(day)}</span>
        </span>
        <span class="pt-0.5">{@render hoursBadge(day.kind)}</span>
      </button>
    </li>
  {/each}
</ol>
