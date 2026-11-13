<script lang="ts">
  // "Destacar meus dias": dims every day that is not mine.
  import { colorOf } from '../format'
  import type { MonthView } from './types'

  type Props = { onlyMine: boolean; view: MonthView; meId: number | null }
  let { onlyMine = $bindable(), view, meId }: Props = $props()

  const myDayCount = $derived(
    view.days.filter((day) => day.segments.some((segment) => segment.devId === meId)).length,
  )
</script>

<button
  type="button"
  role="switch"
  aria-checked={onlyMine}
  disabled={meId === null}
  onclick={() => (onlyMine = !onlyMine)}
  class="inline-flex items-center gap-3 rounded-full border py-1.5 pr-4 pl-1.5 text-sm font-medium shadow-sm transition {onlyMine &&
  meId !== null
    ? `border-emerald-400 ${colorOf(meId)}`
    : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'}"
>
  <span class="relative h-5 w-9 rounded-full transition {onlyMine ? 'bg-emerald-600' : 'bg-stone-300'}">
    <span
      class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {onlyMine
        ? 'translate-x-4'
        : ''}"
    ></span>
  </span>
  Destacar meus dias
  {#if onlyMine}
    <span class="text-xs font-normal opacity-80">· {myDayCount} {myDayCount === 1 ? 'dia' : 'dias'}</span>
  {/if}
</button>
