<script lang="ts">
  // A dev's profile — weight, recurring rules, absences (decisions #5). "Meu perfil", or with `devId`
  // someone else's, edited from the admin screen with the team password.
  import { toast } from 'svelte-sonner'
  import type { Preference, PreferenceRule } from '../../schedule/preferences'
  import AdminUnlock from '../AdminUnlock.svelte'
  import { api, asTeam, call } from '../api'
  import { formatBalance, fullDate, NEUTRAL_TEXT, PREFERENCE_TEXT, WEEKDAYS } from '../format'
  import { links } from '../router.svelte'
  import { session } from '../session.svelte'
  import DateRangePicker from './DateRangePicker.svelte'

  type Props = { devId?: number }
  let { devId }: Props = $props()

  const isAdminEdit = $derived(devId !== undefined)
  type Profile = Awaited<ReturnType<typeof loadProfile>>
  let profile = $state<Profile | null>(null)
  let balance = $state<number | null>(null)
  let nickname = $state('')

  function loadProfile() {
    return devId === undefined
      ? call(api.api.me.$get())
      : call(api.api.devs[':id'].profile.$get({ param: { id: String(devId) } }, asTeam()))
  }

  async function load() {
    const [loaded, devs] = await Promise.all([
      loadProfile(),
      call(isAdminEdit ? api.api.devs.$get({}, asTeam()) : api.api.devs.$get()),
    ])
    profile = loaded
    nickname = loaded.dev.nickname
    balance = devs.find((dev) => dev.id === loaded.dev.id)?.balance ?? null
  }

  async function act(action: () => Promise<unknown>) {
    try {
      await action()
    } catch (failure) {
      toast.error((failure as Error).message)
    }
    await load().catch((failure) => toast.error((failure as Error).message))
  }

  const canLoad = $derived(!isAdminEdit || session.teamPassword !== null)
  $effect(() => {
    if (canLoad) load().catch((failure) => toast.error((failure as Error).message))
  })

  const CYCLE: (Preference | null)[] = [null, 'good', 'avoid', 'cant']
  const STYLE: Record<Preference, string> = {
    good: 'bg-emerald-100 border-emerald-500 text-emerald-900',
    avoid: 'bg-amber-100 border-amber-500 text-amber-900',
    cant: 'bg-stone-800 border-stone-800 text-white',
  }
  type RuleKind = PreferenceRule['kind']

  const ruleOf = (kind: RuleKind, value: number) =>
    profile?.rules.find((rule) => rule.kind === kind && rule.value === value)?.preference ?? null

  function cycle(kind: RuleKind, value: number) {
    if (!profile) return
    const next = CYCLE[(CYCLE.indexOf(ruleOf(kind, value)) + 1) % CYCLE.length] ?? null
    const others = profile.rules.filter((rule) => !(rule.kind === kind && rule.value === value))
    const rules = next ? [...others, { kind, value, preference: next }] : others
    profile.rules = rules // shows the new state at once; the reload confirms it
    act(() =>
      devId === undefined
        ? call(api.api.me.rules.$put({ json: { rules } }))
        : call(api.api.devs[':id'].rules.$put({ param: { id: String(devId) }, json: { rules } }, asTeam())),
    )
  }

  function saveWeight(weight: number) {
    if (!profile) return
    const param = { id: String(profile.dev.id) }
    act(() =>
      call(
        isAdminEdit
          ? api.api.devs[':id'].weight.$put({ param, json: { weight } }, asTeam())
          : api.api.devs[':id'].weight.$put({ param, json: { weight } }),
      ),
    )
  }

  function saveNickname() {
    const typed = nickname.trim()
    if (!profile || devId === undefined || typed === profile.dev.nickname || typed === '') return
    act(() =>
      call(api.api.devs[':id'].$patch({ param: { id: String(devId) }, json: { nickname: typed } }, asTeam())),
    )
  }

  // Overlapping or touching periods are merged by the API into one.
  function addAbsence(fromDate: string, toDate: string) {
    act(() =>
      devId === undefined
        ? call(api.api.me.absences.$post({ json: { fromDate, toDate } }))
        : call(
            api.api.devs[':id'].absences.$post(
              { param: { id: String(devId) }, json: { fromDate, toDate } },
              asTeam(),
            ),
          ),
    )
  }

  function removeAbsence(absenceId: number) {
    act(() =>
      devId === undefined
        ? call(api.api.me.absences[':id'].$delete({ param: { id: String(absenceId) } }))
        : call(
            api.api.devs[':id'].absences[':absenceId'].$delete(
              { param: { id: String(devId), absenceId: String(absenceId) } },
              asTeam(),
            ),
          ),
    )
  }
</script>

{#snippet ruleButton(kind: RuleKind, value: number, text: string)}
  {@const preference = ruleOf(kind, value)}
  <button
    type="button"
    onclick={() => cycle(kind, value)}
    class="flex flex-col items-center justify-center rounded-lg border py-2 text-sm {preference
      ? STYLE[preference]
      : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'}"
  >
    <span class="font-medium {preference ? '' : 'text-stone-900'}">{text}</span>
    <span class="text-[10px] leading-tight">
      {preference ? `${PREFERENCE_TEXT[preference].icon} ${PREFERENCE_TEXT[preference].mine}` : NEUTRAL_TEXT}
    </span>
  </button>
{/snippet}

{#if !canLoad}
  <AdminUnlock />
{:else if profile === null}
  <p class="text-sm text-stone-500">Carregando…</p>
{:else}
  <div class="mx-auto max-w-5xl space-y-8">
    {#if isAdminEdit}
      <div
        class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
      >
        <span
          >Editando o perfil de <b>{profile.dev.nickname}</b> como admin, para quando a pessoa não conseguir
          editar sozinha.</span
        >
        <a href={links.admin} class="ml-auto underline">voltar</a>
      </div>
      <label class="block space-y-1 text-sm">
        <span class="font-medium">Apelido</span>
        <input
          bind:value={nickname}
          onchange={saveNickname}
          maxlength="20"
          class="block rounded-md border border-stone-300 bg-white px-3 py-1.5"
        >
      </label>
    {:else}
      <h1 class="text-2xl font-semibold">Meu perfil · {profile.dev.nickname}</h1>
    {/if}

    <section class="space-y-2">
      <h2 class="font-medium">Participação</h2>
      <div class="flex items-center gap-4">
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          bind:value={profile.dev.weight}
          onchange={() => profile && saveWeight(profile.dev.weight)}
          aria-label="Participação"
          class="min-w-0 flex-1 sm:w-64 sm:flex-none"
        >
        <span class="w-12 tabular-nums">{profile.dev.weight}%</span>
      </div>
      <p class="text-sm text-stone-500">
        100% = parte cheia. 0% = fora da escala (férias longas, licença). Vale a partir do próximo mês aberto.
        {#if balance !== null}
          Saldo atual: <b>{formatBalance(balance)}</b>.
        {/if}
      </p>
    </section>

    <div
      class="flex flex-wrap gap-3 rounded-lg bg-white px-4 py-2 text-xs text-stone-600 ring-1 ring-stone-200"
    >
      <span>Toque num dia para alternar:</span>
      <span>{NEUTRAL_TEXT}</span>→
      <span class="rounded px-1.5 {STYLE.good}">{PREFERENCE_TEXT.good.icon} {PREFERENCE_TEXT.good.mine}</span
      >→
      <span class="rounded px-1.5 {STYLE.avoid}"
        >{PREFERENCE_TEXT.avoid.icon} {PREFERENCE_TEXT.avoid.mine}</span
      >→
      <span class="rounded px-1.5 {STYLE.cant}">{PREFERENCE_TEXT.cant.icon} {PREFERENCE_TEXT.cant.mine}</span>
      <span class="basis-full text-stone-500">
        "Prefiro" e "Evito" são pedidos: a escala tenta atender. "Não posso" nunca é desrespeitado.
      </span>
    </div>

    <section class="space-y-2">
      <h2 class="font-medium">Dias da semana</h2>
      <div class="grid grid-cols-7 gap-2">
        {#each WEEKDAYS as weekday, index (weekday)}
          {@render ruleButton('weekday', index, weekday)}
        {/each}
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="font-medium">Dias do mês</h2>
      <p class="text-sm text-stone-500">
        Para compromissos fixos por data ("todo dia 5 tenho aula"). Se um dia da semana e um dia do mês
        baterem, vale o mais restritivo.
      </p>
      <div class="grid grid-cols-7 gap-2 sm:grid-cols-[repeat(16,minmax(0,1fr))]">
        {#each Array.from({ length: 31 }, (_, index) => index + 1) as day (day)}
          {@render ruleButton('month_day', day, String(day))}
        {/each}
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="font-medium">Ausências</h2>
      <p class="text-sm text-stone-500">Férias, viagens: nesses dias você não entra na escala.</p>
      <div class="flex flex-wrap items-center gap-2">
        {#each profile.absences as absence (absence.id)}
          <span
            class="inline-flex items-center gap-2 rounded-full bg-stone-800 py-1 pr-2 pl-3 text-sm text-white"
          >
            {fullDate(absence.fromDate)}
            → {fullDate(absence.toDate)}
            {#if absence.note}
              <span class="text-stone-300">· {absence.note}</span>
            {/if}
            <button
              type="button"
              aria-label="Remover ausência"
              class="rounded-full px-1 text-stone-300 hover:text-white"
              onclick={() => removeAbsence(absence.id)}
            >
              ✕
            </button>
          </span>
        {/each}
        <DateRangePicker onPick={addAbsence} />
      </div>
    </section>
  </div>
{/if}
