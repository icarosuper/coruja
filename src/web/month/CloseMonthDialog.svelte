<script lang="ts">
  // Asks before undoing the opening of a month (decisions #31).
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
      <Dialog.Title class="text-lg font-semibold"
        >Fechar a escala de {monthTitle(view.id).toLowerCase()}?</Dialog.Title
      >
      <Dialog.Description class="text-sm text-stone-600">
        O mês volta a não estar aberto: a escala, as confirmações e o histórico dele são apagados. Dá para
        abrir de novo depois, com uma escala nova sugerida pelos perfis.
      </Dialog.Description>
    </Dialog.Header>

    {#if view.exported}
      <p class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Esse mês já foi exportado: a planilha do gestor continua com a escala até alguém exportar de novo.
      </p>
    {/if}
    {#if edits.dates > 0}
      <p class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-900">
        Isso apaga {edits.dates}
        {plural(edits.dates, 'dia mudado', 'dias mudados')}
        à mão por {edits.byNicknames.join(', ')}.
      </p>
    {/if}
    {#if confirmedCount > 0}
      <p class="text-sm text-stone-600">
        {confirmedCount}
        {plural(confirmedCount, 'confirmação é desfeita', 'confirmações são desfeitas')}.
      </p>
    {/if}

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
        class="rounded-md bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-700 sm:py-1.5"
        onclick={onConfirm}
      >
        Fechar a escala
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
