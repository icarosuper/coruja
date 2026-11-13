<script lang="ts">
  // Edits one day: who takes it, split points, 15h/24h. A bottom sheet on phones.
  import { untrack } from 'svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { weekdayOf } from '../../schedule/dates'
  import type { Preference } from '../../schedule/preferences'
  import { type DayKind, type Segment, shiftLength } from '../../schedule/shifts'
  import { clock, dayLabel, PREFERENCE_TEXT, WEEKDAYS } from '../format'
  import type { Dev, MonthDay, MonthView } from './types'

  type Props = {
    day: MonthDay
    devs: Dev[]
    preferences: MonthView['preferences']
    isExported: boolean
    onSave: (kind: DayKind, segments: Segment<number>[]) => void
    onClose: () => void
  }
  let { day, devs, preferences, isExported, onSave, onClose }: Props = $props()

  const NOBODY = 0
  // The editor opens for one day and works on a copy of it.
  const initial = untrack(() => day)
  let kind = $state<DayKind>(initial.kind)
  /** Contiguous pieces of the shift: each one ends at `toHour`; the next starts there. */
  let pieces = $state(
    initial.segments.length > 0
      ? initial.segments.map((segment) => ({ devId: segment.devId, toHour: segment.toHour }))
      : [{ devId: NOBODY, toHour: shiftLength(initial.kind) }],
  )
  const length = $derived(shiftLength(kind))
  const fromOf = (index: number) => (index === 0 ? 0 : (pieces[index - 1]?.toHour ?? 0))

  // Devs on the day already stay listed even if deactivated since.
  const options = $derived(
    devs.map((dev) => {
      const preference: Preference | undefined = preferences.find((entry) => entry.devId === dev.id)?.byDate[
        day.date
      ]
      const text = preference ? PREFERENCE_TEXT[preference] : null
      return { dev, label: text ? `${dev.nickname} — ${text.icon} ${text.theirs}` : dev.nickname }
    }),
  )
  const missingOptions = $derived(
    initial.segments.filter((segment) => !devs.some((dev) => dev.id === segment.devId)),
  )

  /** Keeps every piece at least 1h long and the last one ending at the shift's end. */
  function normalize() {
    const kept: typeof pieces = []
    let from = 0
    for (const [index, piece] of pieces.entries()) {
      const isLast = index === pieces.length - 1
      piece.toHour = isLast ? length : Math.min(Math.max(piece.toHour, from + 1), length)
      kept.push(piece)
      from = piece.toHour
      if (from >= length) break
    }
    const last = kept.at(-1)
    if (last) last.toHour = length
    pieces = kept
  }

  function changeKind(newKind: DayKind) {
    kind = newKind
    normalize()
  }

  const lastPieceHours = $derived(length - fromOf(pieces.length - 1))
  const canSplit = $derived(lastPieceHours >= 2)

  function split() {
    const last = pieces.at(-1)
    if (!last) return
    const from = fromOf(pieces.length - 1)
    const middle = from + Math.floor((length - from) / 2)
    pieces = [
      ...pieces.slice(0, -1),
      { devId: last.devId, toHour: middle },
      { devId: NOBODY, toHour: length },
    ]
  }

  function removePiece(index: number) {
    const removed = pieces[index]
    const previous = pieces[index - 1]
    if (previous && removed) previous.toHour = removed.toHour
    pieces = pieces.filter((_, pieceIndex) => pieceIndex !== index)
    normalize()
  }

  // A shift is either fully covered or left to nobody: the API refuses gaps.
  const emptyPieces = $derived(pieces.filter((piece) => piece.devId === NOBODY).length)
  const hasGap = $derived(emptyPieces > 0 && emptyPieces < pieces.length)

  /** Pieces in a row with the same dev become one segment. */
  function mergedSegments(): Segment<number>[] {
    const segments: Segment<number>[] = []
    pieces.forEach((piece, index) => {
      const previous = segments.at(-1)
      const continuesPrevious = previous?.devId === piece.devId
      if (previous && continuesPrevious) previous.toHour = piece.toHour
      else segments.push({ devId: piece.devId, fromHour: fromOf(index), toHour: piece.toHour })
    })
    return segments.filter((segment) => segment.devId !== NOBODY)
  }
</script>

<Dialog.Root open onOpenChange={(isOpen) => !isOpen && onClose()}>
  <Dialog.Content
    class="top-auto bottom-0 left-0 max-h-[90dvh] max-w-none translate-x-0 translate-y-0 gap-4 overflow-y-auto rounded-t-2xl rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-base sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-5"
  >
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold"
        >{WEEKDAYS[weekdayOf(day.date)]}, {dayLabel(day.date)}</Dialog.Title
      >
      {#if day.holidayName}
        <Dialog.Description class="text-sm text-stone-500">{day.holidayName}</Dialog.Description>
      {/if}
    </Dialog.Header>

    <div class="grid grid-cols-2 rounded-lg border border-stone-300 p-0.5 text-sm sm:inline-grid">
      <button
        type="button"
        class="rounded-md px-3 py-1.5 {kind === 'workday' ? 'bg-stone-900 text-white' : ''}"
        onclick={() => changeKind('workday')}
      >
        Dia útil <span class="block text-xs opacity-75 sm:inline sm:text-sm">18h–09h (15h)</span>
      </button>
      <button
        type="button"
        class="rounded-md px-3 py-1.5 {kind === 'day_off' ? 'bg-stone-900 text-white' : ''}"
        onclick={() => changeKind('day_off')}
      >
        Folga <span class="block text-xs opacity-75 sm:inline sm:text-sm">09h–09h (24h)</span>
      </button>
    </div>

    <div class="space-y-2">
      {#each pieces as piece, index (index)}
        <div class="flex items-center gap-2">
          <span class="w-28 shrink-0 text-sm text-stone-600 tabular-nums">
            {clock(kind, fromOf(index))}
            –
            {#if index < pieces.length - 1}
              <select
                bind:value={piece.toHour}
                onchange={normalize}
                aria-label="Fim do trecho"
                class="rounded border border-stone-300 bg-white px-1 py-0.5"
              >
                {#each Array.from(
                  { length: length - fromOf(index) - 1 },
                  (_, offset) => fromOf(index) + offset + 1,
                ) as hour (hour)}
                  <option value={hour}>{clock(kind, hour)}</option>
                {/each}
              </select>
            {:else}
              {clock(kind, length)}
            {/if}
          </span>
          <select
            bind:value={piece.devId}
            aria-label="Quem"
            class="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 py-2 sm:py-1.5"
          >
            <option value={NOBODY}>— ninguém —</option>
            {#each options as option (option.dev.id)}
              <option value={option.dev.id}>{option.label}</option>
            {/each}
            {#each missingOptions as segment (segment.devId)}
              <option value={segment.devId}>{segment.nickname}</option>
            {/each}
          </select>
          {#if pieces.length > 1}
            <button
              type="button"
              aria-label="Remover trecho"
              class="px-1.5 py-1 text-stone-400 hover:text-rose-600"
              onclick={() => removePiece(index)}
            >
              ✕
            </button>
          {/if}
        </div>
      {/each}
      <button
        type="button"
        class="text-sm text-sky-700 hover:underline disabled:text-stone-400 disabled:no-underline"
        disabled={!canSplit}
        title={canSplit ? '' : 'O último trecho tem só 1h: não dá para dividir mais'}
        onclick={split}
      >
        + dividir o turno
      </button>
    </div>

    {#if hasGap}
      <p class="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
        Todo trecho precisa de alguém. Para deixar o dia vazio, remova os trechos até sobrar um e escolha
        "ninguém".
      </p>
    {:else}
      <p class="text-xs text-stone-500">
        {isExported
          ? 'Este mês já foi exportado: depois de salvar, exporte de novo para a mudança chegar à planilha.'
          : 'Quem tiver as horas mudadas precisa confirmar o mês de novo.'}
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
        disabled={hasGap}
        class="rounded-md bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-30 sm:py-1.5"
        onclick={() => onSave(kind, mergedSegments())}
      >
        Salvar
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
