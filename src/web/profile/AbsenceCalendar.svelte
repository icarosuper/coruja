<script lang="ts">
  // The days a dev can't take, on a month calendar (decisions #5). Tap a day to mark or clear it; drag
  // across days (mouse or finger, also from one month into the next) to do the same to all of them.
  import {
    daysOfMonth,
    type IsoDate,
    type MonthId,
    monthOf,
    nextMonth,
    previousMonth,
    weekdayOf,
  } from '../../schedule/dates'
  import type { Absence } from '../../schedule/preferences'
  import { today } from '../calendar'
  import { dayLabel, monthName, monthTitle, WEEKDAYS } from '../format'
  import { links } from '../router.svelte'

  type Props = {
    absences: Absence[]
    /** Months that already have a roster: a change here only reaches them if they are regenerated. */
    rosterMonths: MonthId[]
    onChange: (fromDate: IsoDate, toDate: IsoDate, absent: boolean) => void
  }
  let { absences, rosterMonths, onChange }: Props = $props()

  const todayDate = today()
  const firstMonth = monthOf(todayDate)
  let shownMonth = $state(nextMonth(firstMonth))

  const isAbsent = (date: IsoDate) =>
    absences.some((absence) => absence.fromDate <= date && date <= absence.toDate)
  const isPast = (date: IsoDate) => date < todayDate

  // Two months side by side from 1000px up (a range can be dragged across both); one on phones.
  const visibleMonths = $derived([shownMonth, nextMonth(shownMonth)])
  const upcoming = $derived(absences.filter((absence) => absence.toDate >= todayDate))

  // A drag from `anchor` to `hovered` paints every day between them with `paintAbsent`.
  let drag = $state<{ anchor: IsoDate; hovered: IsoDate; paintAbsent: boolean } | null>(null)
  const dragRange = $derived(
    drag === null
      ? null
      : drag.anchor <= drag.hovered
        ? { fromDate: drag.anchor, toDate: drag.hovered }
        : { fromDate: drag.hovered, toDate: drag.anchor },
  )
  const isPainted = (date: IsoDate) =>
    dragRange !== null && dragRange.fromDate <= date && date <= dragRange.toDate

  const dateAt = (event: PointerEvent) =>
    (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>(
      '[data-date]',
    )?.dataset.date

  function startDrag(event: PointerEvent, date: IsoDate) {
    if (isPast(date) || event.button !== 0) return
    event.preventDefault()
    drag = { anchor: date, hovered: date, paintAbsent: !isAbsent(date) }
  }

  function moveDrag(event: PointerEvent) {
    if (drag === null) return
    const date = dateAt(event)
    if (date && !isPast(date)) drag.hovered = date
  }

  function endDrag() {
    if (drag === null || dragRange === null) return
    onChange(dragRange.fromDate, dragRange.toDate, drag.paintAbsent)
    drag = null
  }

  // Keyboard: Enter/Space toggles the focused day.
  function toggle(date: IsoDate) {
    if (!isPast(date)) onChange(date, date, !isAbsent(date))
  }

  /** A period that started in the past is shown from today's month, the first one on screen. */
  function monthToShow(absence: Absence): MonthId {
    const hasStarted = absence.fromDate < todayDate
    if (hasStarted) return firstMonth
    return monthOf(absence.fromDate)
  }

  const periodText = (absence: Absence) =>
    absence.fromDate === absence.toDate
      ? dayLabel(absence.fromDate)
      : `${dayLabel(absence.fromDate)} → ${dayLabel(absence.toDate)}`
</script>

<svelte:window onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={() => (drag = null)} />

{#snippet monthGrid(month: MonthId)}
  <div class="space-y-2">
    <p class="text-center font-medium">{monthTitle(month)}</p>
    {#if rosterMonths.includes(month)}
      <p class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        A escala de {monthName(month)} já foi gerada: o que você marcar aqui só vale se ela for regerada. Para
        mudar agora, edite o dia na <a href={links.month(month)} class="underline">escala do mês</a>.
      </p>
    {/if}
    <div class="grid grid-cols-7 gap-1.5 text-center text-xs text-stone-500">
      {#each WEEKDAYS as weekday (weekday)}
        <span>{weekday}</span>
      {/each}
    </div>
    <div class="grid touch-none grid-cols-7 gap-1.5 select-none">
      {#each Array.from({ length: weekdayOf(`${month}-01`) }) as _, index (index)}
        <span></span>
      {/each}
      {#each daysOfMonth(month) as date (date)}
        {@const absent = drag !== null && isPainted(date) ? drag.paintAbsent : isAbsent(date)}
        <button
          type="button"
          data-date={date}
          disabled={isPast(date)}
          aria-pressed={absent}
          aria-label="{dayLabel(date)}{absent ? ', não posso' : ''}"
          onpointerdown={(event) => startDrag(event, date)}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggle(date)
            }
          }}
          class="h-12 rounded-lg border text-base transition-colors sm:h-14 {absent
            ? 'border-stone-800 bg-stone-800 text-white'
            : 'border-stone-200 bg-white text-stone-900 hover:bg-stone-50'} {isPainted(date)
            ? 'ring-2 ring-stone-400'
            : ''} disabled:cursor-not-allowed disabled:opacity-30"
        >
          {Number(date.slice(8))}
        </button>
      {/each}
    </div>
  </div>
{/snippet}

<div class="space-y-4">
  <div class="relative">
    <button
      type="button"
      aria-label="Mês anterior"
      disabled={shownMonth <= firstMonth}
      onclick={() => (shownMonth = previousMonth(shownMonth))}
      class="absolute top-0 left-0 z-10 rounded-md px-3 py-0 text-xl hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      ‹
    </button>
    <button
      type="button"
      aria-label="Próximo mês"
      onclick={() => (shownMonth = nextMonth(shownMonth))}
      class="absolute top-0 right-0 z-10 rounded-md px-3 py-0 text-xl hover:bg-stone-100"
    >
      ›
    </button>
    <div class="grid gap-8 min-[1000px]:grid-cols-2">
      {#each visibleMonths as month, index (month)}
        <div class={index > 0 ? 'hidden min-[1000px]:block' : ''}>
          {@render monthGrid(month)}
        </div>
      {/each}
    </div>
  </div>

  {#if upcoming.length > 0}
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-stone-500">Marcados:</span>
      {#each upcoming as absence (absence.fromDate)}
        <button
          type="button"
          onclick={() => (shownMonth = monthToShow(absence))}
          class="rounded-full bg-stone-800 px-3 py-0.5 text-white hover:bg-stone-700"
        >
          {periodText(absence)}
        </button>
      {/each}
    </div>
  {/if}
</div>
