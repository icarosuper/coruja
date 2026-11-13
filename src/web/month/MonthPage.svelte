<script lang="ts">
  // One month: header with arrows and actions, the calendar, hours and the log (decisions #26).
  import { toast } from 'svelte-sonner'
  import { type MonthId, monthOf, nextMonth, previousMonth } from '../../schedule/dates'
  import type { DayKind, Segment } from '../../schedule/shifts'
  import { api, call } from '../api'
  import { defaultMonth, opensOn, today } from '../calendar'
  import { dayLabel } from '../format'
  import { session } from '../session.svelte'
  import { downloadXlsx } from '../xlsx'
  import DayEditor from './DayEditor.svelte'
  import ExportNotice from './ExportNotice.svelte'
  import HighlightSwitch from './HighlightSwitch.svelte'
  import MonthCalendar from './MonthCalendar.svelte'
  import MonthHeader from './MonthHeader.svelte'
  import MonthSidePanel from './MonthSidePanel.svelte'
  import TodayChip from './TodayChip.svelte'
  import type { Dev, LogEntry, MonthDay, MonthSummary, MonthView } from './types'

  type Props = { month: MonthId }
  let { month }: Props = $props()

  const todayDate = today()
  let months = $state<MonthSummary[] | null>(null)
  let view = $state<MonthView | null>(null)
  let todayView = $state<MonthView | null>(null)
  let devs = $state<Dev[]>([])
  let log = $state<LogEntry[]>([])
  let editing = $state<MonthDay | null>(null)
  let onlyMine = $state(false)
  let exportNotice: { kind: 'script'; script: string; copied: boolean } | { kind: 'grid' } | null =
    $state(null)

  const monthParam = () => ({ param: { month } })

  async function load() {
    const [monthList, devList] = await Promise.all([call(api.api.months.$get()), call(api.api.devs.$get())])
    months = monthList
    devs = devList
    const exists = monthList.some((summary) => summary.id === month)
    const [monthView, monthLog] = exists
      ? await Promise.all([
          call(api.api.months[':month'].$get(monthParam())),
          call(api.api.months[':month'].log.$get(monthParam())),
        ])
      : [null, []]
    view = monthView
    log = monthLog
    const todayMonth = monthOf(todayDate)
    const hasTodayMonth = monthList.some((summary) => summary.id === todayMonth)
    todayView =
      todayMonth === month
        ? monthView
        : hasTodayMonth
          ? await call(api.api.months[':month'].$get({ param: { month: todayMonth } }))
          : null
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

  // Arrows go from the first month in Coruja to the one after the newest (shown as "opens on…").
  const newestMonth = $derived(months?.[0]?.id ?? null)
  const firstMonth = $derived(months?.at(-1)?.id ?? null)
  const lastNavigableMonth = $derived(newestMonth ? nextMonth(newestMonth) : defaultMonth(todayDate))
  const hasPrevious = $derived(firstMonth !== null && previousMonth(month) >= firstMonth)
  const hasNext = $derived(nextMonth(month) <= lastNavigableMonth)

  /** Opening by hand: the next month (or the first one) once its 20th has come. The cron does it too. */
  const canOpenNow = $derived(
    view === null &&
      months !== null &&
      (newestMonth === null || month === nextMonth(newestMonth)) &&
      todayDate >= opensOn(month),
  )
  const isBeforeCoruja = $derived(view === null && firstMonth !== null && month < firstMonth)

  const confirm = () => act(() => call(api.api.months[':month'].confirm.$post(monthParam())))
  const unconfirm = () => act(() => call(api.api.months[':month'].confirm.$delete(monthParam())))
  const openNow = () => act(() => call(api.api.months[':month'].open.$post(monthParam())))

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
  />

  {#if exportNotice}
    <ExportNotice notice={exportNotice} onClose={() => (exportNotice = null)} />
  {/if}

  {#if months === null}
    <p class="text-sm text-stone-500">Carregando…</p>
  {:else if view === null}
    <div class="mx-auto max-w-xl rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
      <div class="text-4xl">🗓️</div>
      {#if isBeforeCoruja}
        <p class="mt-3 text-lg font-medium">Esse mês é de antes do Coruja</p>
      {:else}
        <p class="mt-3 text-lg font-medium">
          {todayDate >= opensOn(month)
            ? 'Este mês ainda não foi aberto'
            : `Este mês abre em ${dayLabel(opensOn(month))}`}
        </p>
        <p class="mt-1 text-sm text-stone-500">
          Ele já abre com a escala sugerida pelos perfis. Até lá, deixe suas preferências e ausências em dia
          no <a href="#/perfil" class="underline">Meu perfil</a>.
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
