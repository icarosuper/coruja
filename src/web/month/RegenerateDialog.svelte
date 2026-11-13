<script lang="ts">
  // Asks before throwing the month's roster away for a new suggestion (decisions #28).
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { monthTitle } from '../format'
  import type { MonthView } from './types'

  type Props = { view: MonthView; onConfirm: () => void; onClose: () => void }
  let { view, onConfirm, onClose }: Props = $props()

  const edits = $derived(view.editsAfterSuggestion)
  const confirmedCount = $derived(view.participants.filter((participant) => participant.confirmed).length)
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)
</script>

<Dialog.Root open onOpenChange={(isOpen) => !isOpen && onClose()}>
  <Dialog.Content
    class="top-auto bottom-0 left-0 max-h-[90dvh] max-w-none translate-x-0 translate-y-0 gap-4 overflow-y-auto rounded-t-2xl rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-base sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-5"
  >
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold">Gerar a escala de novo?</Dialog.Title>
      <Dialog.Description class="text-sm text-stone-600">
        O Coruja monta outra escala para {monthTitle(view.id).toLowerCase()} com os perfis, ausências e pesos
        de hoje. O tipo de cada dia (útil ou folga) continua como está.
      </Dialog.Description>
    </Dialog.Header>

    {#if edits.dates > 0}
      <p class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-900">
        Isso apaga {edits.dates}
        {plural(edits.dates, 'dia mudado', 'dias mudados')}
        à mão por {edits.byNicknames.join(', ')}.
      </p>
    {/if}
    <p class="text-sm text-stone-600">
      {confirmedCount > 0
        ? `${confirmedCount} ${plural(confirmedCount, 'confirmação é desfeita', 'confirmações são desfeitas')}: todo mundo confirma de novo.`
        : 'Todo mundo vai confirmar a escala nova.'}
    </p>

    <div class="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
      <button
        type="button"
        class="rounded-md px-3 py-2 text-sm hover:bg-stone-100 sm:py-1.5"
        onclick={onClose}
      >
        Cancelar
      </button>
      <button
        type="button"
        class="rounded-md bg-stone-900 px-3 py-2 text-sm text-white sm:py-1.5"
        onclick={onConfirm}
      >
        Gerar de novo
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
