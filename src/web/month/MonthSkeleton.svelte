<script lang="ts">
  // The month page's shape while its first answer is on the way: calendar, and the side panel.
  import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte'
  import { WEEKDAYS } from '../format'

  const CALENDAR_CELLS = 35
  const PHONE_ROWS = 8
  const PANEL_ROWS = 6
</script>

<div
  class="grid gap-6 xl:grid-cols-[1fr_24rem]"
  role="status"
  aria-busy="true"
  aria-label="Carregando a escala"
>
  <section>
    <div class="mb-3 flex items-center justify-between gap-2">
      <Skeleton class="h-8 w-44" />
      <Skeleton class="h-8 w-32" />
    </div>
    <div
      class="hidden grid-cols-7 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 md:grid"
    >
      {#each WEEKDAYS as weekday (weekday)}
        <div class="bg-stone-100 py-2 text-center text-sm font-medium text-stone-500 uppercase">
          {weekday}
        </div>
      {/each}
      {#each Array.from({ length: CALENDAR_CELLS }) as _, index (index)}
        <div class="flex min-h-[max(6rem,calc((100dvh-22rem)/5))] flex-col gap-2 bg-white p-2">
          <div class="flex items-center justify-between">
            <Skeleton class="h-5 w-6" />
            <Skeleton class="h-5 w-9" />
          </div>
          <Skeleton class="h-7 w-full" />
        </div>
      {/each}
    </div>
    <ol class="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 md:hidden">
      {#each Array.from({ length: PHONE_ROWS }) as _, index (index)}
        <li class="flex items-center gap-3 bg-white px-3 py-3">
          <Skeleton class="h-10 w-10" />
          <Skeleton class="h-7 flex-1" />
        </li>
      {/each}
    </ol>
  </section>
  <aside class="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
    <Skeleton class="h-6 w-32" />
    {#each Array.from({ length: PANEL_ROWS }) as _, index (index)}
      <Skeleton class="h-8 w-full" />
    {/each}
  </aside>
</div>
