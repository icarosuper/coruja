<script lang="ts">
  // One month: header with arrows and actions, the calendar, hours and the log (decisions #26).
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { defaultMonth } from '../../schedule/calendar'
  import { type MonthId, monthOf, nextMonth, previousMonth } from '../../schedule/dates'
  import type { DayKind, Segment } from '../../schedule/shifts'
  import { ApiFailure, api, call } from '../api'
  import { cached, remember } from '../cache.svelte'
  import { today } from '../calendar'
  import { links } from '../router.svelte'
  import { session } from '../session.svelte'
  import { downloadXlsx } from '../xlsx'
  import CloseMonthDialog from './CloseMonthDialog.svelte'
  import DayEditor from './DayEditor.svelte'
  import ExportNotice from './ExportNotice.svelte'
  import HighlightSwitch from './HighlightSwitch.svelte'
  import MonthCalendar from './MonthCalendar.svelte'
  import MonthHeader from './MonthHeader.svelte'
  import MonthSidePanel from './MonthSidePanel.svelte'
  import MonthSkeleton from './MonthSkeleton.svelte'
  import RegenerateDialog from './RegenerateDialog.svelte'
  import TodayChip from './TodayChip.svelte'
  import type { Dev, LogEntry, MonthDay, MonthSummary, MonthView } from './types'

  type Props = { month: MonthId }
  let { month }: Props = $props()

  const todayDate = today()
  const todayMonth = monthOf(todayDate)
  // App re-creates the page for each month ({#key}), so the month never changes under it.
  const cacheKey = untrack(() => `month:${month}`)
  type MonthPageAnswers = {
    months: MonthSummary[]
    devs: Dev[]
    view: MonthView | null
    log: LogEntry[]
    todayView: MonthView | null
  }
  const remembered = cached<MonthPageAnswers>(cacheKey)
  let months = $state<MonthSummary[] | null>(remembered?.months ?? null)
  let view = $state<MonthView | null>(remembered?.view ?? null)
  let todayView = $state<MonthView | null>(remembered?.todayView ?? null)
  let devs = $state<Dev[]>(remembered?.devs ?? [])
  let log = $state<LogEntry[]>(remembered?.log ?? [])
  let editing = $state<MonthDay | null>(null)
  let onlyMine = $state(false)
  let isRegenerateOpen = $state(false)
  let isCloseOpen = $state(false)
  let exportNotice: { kind: 'script'; script: string; copied: boolean } | { kind: 'grid' } | null =
    $state(null)

  const monthParam = () => ({ param: { month } })

  /** Null for a month that does not exist yet, so it can be asked for together with the month list. */
  async function unlessMonthMissing<Answer>(request: Promise<Answer>): Promise<Answer | null> {
    try {
      return await request
    } catch (failure) {
      const isMonthMissing = failure instanceof ApiFailure && failure.code === 'month_not_found'
      if (isMonthMissing) return null
      throw failure
    }
  }

  /** Everything in one round trip (decisions #30): each wave of requests costs a trip to the US. */
  async function load() {
    const isTodayMonth = todayMonth === month
    const [monthList, devList, monthView, monthLog, todayMonthView] = await Promise.all([
      call(api.api.months.$get()),
      call(api.api.devs.$get()),
      unlessMonthMissing(call(api.api.months[':month'].$get(monthParam()))),
      unlessMonthMissing(call(api.api.months[':month'].log.$get(monthParam()))),
      isTodayMonth
        ? null
        : unlessMonthMissing(call(api.api.months[':month'].$get({ param: { month: todayMonth } }))),
    ])
    const answers: MonthPageAnswers = {
      months: monthList,
      devs: devList,
      view: monthView,
      log: monthLog ?? [],
      todayView: isTodayMonth ? monthView : todayMonthView,
    }
    remember(cacheKey, answers)
    months = answers.months
    devs = answers.devs
    view = answers.view
    log = answers.log
    todayView = answers.todayView
  }

  /** Runs an action, shows its error as a toast and reloads the month either way. */
  async function act(action: () => Promise<unknown>) {
    try {
      await action()
    } catch (failure) {
      toast.error((failure as Error).message)
    }
    await load().catch((failure) => toast.error((failure as Error).message))
  }

  $effect(() => {
    load().catch((failure) => toast.error((failure as Error).message))
  })

  // Arrows go from the first month in Coruja to the one after the newest (shown as not opened yet).
  const newestMonth = $derived(months?.[0]?.id ?? null)
  const firstMonth = $derived(months?.at(-1)?.id ?? null)
  const lastNavigableMonth = $derived(newestMonth ? nextMonth(newestMonth) : defaultMonth(todayDate))
  const hasPrevious = $derived(firstMonth !== null && previousMonth(month) >= firstMonth)
  const hasNext = $derived(nextMonth(month) <= lastNavigableMonth)

  /** Any dev opens the first month, or the one after the newest, whenever they want (decisions #7). */
  const canOpenNow = $derived(
    view === null && months !== null && (newestMonth === null || month === nextMonth(newestMonth)),
  )
  const isBeforeCoruja = $derived(view === null && firstMonth !== null && month < firstMonth)

  const confirm = () => act(() => call(api.api.months[':month'].confirm.$post(monthParam())))
  const unconfirm = () => act(() => call(api.api.months[':month'].confirm.$delete(monthParam())))
  const openNow = () => act(() => call(api.api.months[':month'].open.$post(monthParam())))

  /** A new suggestion replaces the roster only before the export and on the newest month (decisions #28). */
  const canRegenerate = $derived(view !== null && view.exported === null && month === newestMonth)
  function regenerate() {
    isRegenerateOpen = false
    act(() => call(api.api.months[':month'].regenerate.$post(monthParam())))
  }

  /** Undoing the opening: the newest month, not started yet, exported or not (decisions #31). */
  const canCloseMonth = $derived(view !== null && month === newestMonth && month > todayMonth)
  function closeMonth() {
    isCloseOpen = false
    act(() => call(api.api.months[':month'].$delete(monthParam())))
  }

  async function exportMonth(format: 'office_script' | 'paste_grid') {
    await act(async () => {
      const exported = await call(
        api.api.months[':month'].export.$post({ ...monthParam(), json: { format } }),
      )
      if (exported.script !== null) {
        const copied = await navigator.clipboard.writeText(exported.script).then(
          () => true,
          () => false,
        )
        exportNotice = { kind: 'script', script: exported.script, copied }
      }
      if (exported.grid !== null) {
        downloadXlsx(`coruja-${month}.xlsx`, exported.grid)
        exportNotice = { kind: 'grid' }
      }
    })
  }

  async function saveDay(date: string, kind: DayKind, segments: Segment<number>[]) {
    editing = null
    await act(() =>
      call(api.api.months[':month'].days[':date'].$put({ param: { month, date }, json: { kind, segments } })),
    )
  }
</script>

<div class="space-y-5">
  <MonthHeader
    {month}
    {view}
    {hasPrevious}
    {hasNext}
    meId={session.me?.id ?? null}
    onConfirm={confirm}
    onUnconfirm={unconfirm}
    onExport={exportMonth}
    onRegenerate={canRegenerate ? () => (isRegenerateOpen = true) : null}
    onCloseMonth={canCloseMonth ? () => (isCloseOpen = true) : null}
  />

  {#if exportNotice}
    <ExportNotice notice={exportNotice} onClose={() => (exportNotice = null)} />
  {/if}

  {#if months === null}
    <MonthSkeleton />
  {:else if view === null}
    <div class="mx-auto max-w-xl rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
      <div class="text-4xl">🗓️</div>
      {#if isBeforeCoruja}
        <p class="mt-3 text-lg font-medium">Esse mês é de antes do Coruja</p>
      {:else if newestMonth === null}
        <!-- The first month comes from the sheet (decisions #16): it brings the shifts already taken and
             is born exported. Opening it with a suggestion is only for a team without a sheet. -->
        <p class="mt-3 text-lg font-medium">O Coruja ainda não tem nenhum mês</p>
        <p class="mt-1 text-sm text-stone-500">
          Comece importando o mês atual da planilha do gestor em
          <a href={links.admin} class="underline">Admin → Planilha</a>. Ele entra como já exportado, com os
          turnos que já foram feitos, e é dele que o Coruja parte para os próximos meses.
        </p>
        {#if canOpenNow}
          <button type="button" onclick={openNow} class="mt-4 text-sm text-stone-500 underline">
            Sem planilha? Começar por este mês com a escala sugerida
          </button>
        {/if}
      {:else}
        <p class="mt-3 text-lg font-medium">Este mês ainda não foi aberto</p>
        <p class="mt-1 text-sm text-stone-500">
          Qualquer um abre quando o time quiser, e ele já vem com a escala sugerida pelos perfis. Antes, deixe
          suas preferências e ausências em dia no <a href="#/perfil" class="underline">Meu perfil</a>.
        </p>
        {#if canOpenNow}
          <button
            type="button"
            onclick={openNow}
            class="mt-4 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white"
          >
            Abrir agora com a escala sugerida
          </button>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <section>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <HighlightSwitch bind:onlyMine {view} meId={session.me?.id ?? null} />
          <TodayChip date={todayDate} {todayView} {month} />
        </div>
        <MonthCalendar
          {view}
          {onlyMine}
          meId={session.me?.id ?? null}
          {todayDate}
          onEdit={(day) => (editing = day)}
        />
      </section>
      <MonthSidePanel {view} {log} {devs} />
    </div>
  {/if}
</div>

{#if editing && view}
  <DayEditor
    day={editing}
    devs={devs.filter((dev) => dev.active)}
    preferences={view.preferences}
    isExported={view.exported !== null}
    onSave={(kind, segments) => editing && saveDay(editing.date, kind, segments)}
    onClose={() => (editing = null)}
  />
{/if}

{#if isCloseOpen && view}
  <CloseMonthDialog {view} onConfirm={closeMonth} onClose={() => (isCloseOpen = false)} />
{/if}

{#if isRegenerateOpen && view}
  <RegenerateDialog {view} onConfirm={regenerate} onClose={() => (isRegenerateOpen = false)} />
{/if}
