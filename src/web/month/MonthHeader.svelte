<script lang="ts">
  // Month title with ‹ ›, the month's state and the confirm / export actions (decisions #26).
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import { type MonthId, nextMonth, previousMonth } from '../../schedule/dates'
  import { formatTimestamp, monthTitle } from '../format'
  import { links } from '../router.svelte'
  import type { MonthView } from './types'

  type Props = {
    month: MonthId
    view: MonthView | null
    hasPrevious: boolean
    hasNext: boolean
    meId: number | null
    onConfirm: () => void
    onUnconfirm: () => void
    onExport: (format: 'office_script' | 'paste_grid') => void
  }
  let { month, view, hasPrevious, hasNext, meId, onConfirm, onUnconfirm, onExport }: Props = $props()

  const pending = $derived(view?.participants.filter((participant) => !participant.confirmed) ?? [])
  const holes = $derived(view?.unassignedDates ?? [])
  const myParticipation = $derived(view?.participants.find((participant) => participant.devId === meId))
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)
</script>

{#snippet chevron(path: string)}
  <svg
    viewBox="0 0 24 24"
    class="h-5 w-5"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
{/snippet}

{#snippet arrow(target: MonthId, enabled: boolean, label: string, path: string)}
  {#if enabled}
    <a
      href={links.month(target)}
      aria-label={label}
      title={label}
      class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
      >{@render chevron(path)}</a
    >
  {:else}
    <span
      aria-hidden="true"
      class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 text-stone-300"
      >{@render chevron(path)}</span
    >
  {/if}
{/snippet}

<div class="flex flex-wrap items-center gap-3">
  <div class="flex w-full items-center gap-2 sm:w-auto">
    {@render arrow(previousMonth(month), hasPrevious, 'Mês anterior', 'M15 18l-6-6 6-6')}
    <h1 class="min-w-0 flex-1 text-center text-2xl font-semibold sm:w-60 sm:flex-none">
      {monthTitle(month)}
    </h1>
    {@render arrow(nextMonth(month), hasNext, 'Próximo mês', 'M9 18l6-6-6-6')}
  </div>

  {#if view}
    <div class="flex flex-wrap items-center gap-2">
      {#if view.exported}
        <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900">
          ✓
          {view.exported.byNickname
            ? `exportado em ${formatTimestamp(view.exported.at)} por ${view.exported.byNickname}`
            : 'importado da planilha'}
        </span>
        {#if view.exported.changesAfter > 0}
          <span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
            {view.exported.changesAfter}
            {plural(view.exported.changesAfter, 'mudança', 'mudanças')}
            depois · exporte de novo
          </span>
        {/if}
      {:else}
        {#if holes.length > 0}
          <span class="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-900">
            {holes.length}
            {plural(holes.length, 'dia', 'dias')}
            sem ninguém
          </span>
        {/if}
        {#if pending.length > 0}
          <span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
            {pending.length === 1 ? 'falta 1 confirmar' : `faltam ${pending.length} confirmarem`}
          </span>
        {:else if holes.length === 0}
          <span class="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-900">
            pronto para exportar
          </span>
        {/if}
      {/if}
    </div>

    <div class="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
      {#if !view.exported && myParticipation}
        <button
          type="button"
          onclick={myParticipation.confirmed ? onUnconfirm : onConfirm}
          class="rounded-md px-3 py-1.5 text-sm font-medium {myParticipation.confirmed
            ? 'border border-stone-300 hover:bg-stone-100'
            : 'bg-emerald-600 text-white hover:bg-emerald-700'}"
        >
          {#if myParticipation.confirmed}
            ✓ Confirmado <span class="block text-xs text-stone-500 sm:inline sm:text-sm">(desfazer)</span>
          {:else}
            Confirmar minha escala
          {/if}
        </button>
      {/if}
      <div class={view.exported || !myParticipation ? 'col-span-2' : ''}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            disabled={holes.length > 0}
            title={holes.length > 0 ? 'Todo dia precisa de alguém antes de exportar' : ''}
            class="h-full w-full rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-30"
          >
            {view.exported ? 'Exportar de novo' : 'Exportar'}
            ▾
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-[min(22rem,calc(100vw-2rem))] p-2">
            {#if !view.exported && pending.length > 0}
              <p class="mb-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {pending.map((participant) => participant.nickname).join(', ')}
                {plural(pending.length, 'ainda não confirmou', 'ainda não confirmaram')}. Dá para exportar
                mesmo assim.
              </p>
            {/if}
            <DropdownMenu.Item class="block px-3 py-2" onSelect={() => onExport('office_script')}>
              <span class="font-medium">📋 Copiar Office Script</span>
              <span class="block text-xs text-stone-500"
                >Preenche a coluna Banking da planilha do gestor.</span
              >
            </DropdownMenu.Item>
            <DropdownMenu.Item class="block px-3 py-2" onSelect={() => onExport('paste_grid')}>
              <span class="font-medium">⬇️ Baixar tabela do Excel</span>
              <span class="block text-xs text-stone-500"
                >Um .xlsx com o mês, para colar com "Colar especial → Ignorar em branco".</span
              >
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  {/if}
</div>
