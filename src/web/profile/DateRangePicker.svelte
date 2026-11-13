<script lang="ts">
  // Airline-style range: one field, two months (one on phones), click the first and the last day.
  import type { DateRange } from 'bits-ui'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import { RangeCalendar } from '$lib/components/ui/range-calendar/index.js'

  type Props = { onPick: (fromDate: string, toDate: string) => void; label?: string }
  let { onPick, label = '+ Adicionar período' }: Props = $props()

  let isOpen = $state(false)
  let range = $state<DateRange | undefined>(undefined)
  const isPhone = matchMedia('(max-width: 639px)').matches

  function onRangeChange(picked: DateRange) {
    const { start, end } = picked
    if (!start || !end) return
    onPick(start.toString(), end.toString())
    range = undefined
    isOpen = false
  }
</script>

<Popover.Root bind:open={isOpen}>
  <Popover.Trigger
    class="rounded-full border border-dashed border-stone-400 px-3 py-1 text-sm text-stone-600 hover:border-stone-600 hover:text-stone-900"
  >
    {label}
  </Popover.Trigger>
  <Popover.Content align="start" class="w-auto p-2">
    <p class="px-2 pt-1 text-xs text-stone-500">Escolha o primeiro e o último dia</p>
    <RangeCalendar
      bind:value={range}
      onValueChange={onRangeChange}
      numberOfMonths={isPhone ? 1 : 2}
      locale="pt-BR"
      weekdayFormat="narrow"
    />
  </Popover.Content>
</Popover.Root>
