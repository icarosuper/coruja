<script lang="ts">
  // A dev's profile — weight, weekday rules, days they can't take (decisions #5). "Meu perfil", or with `devId`
  // someone else's, edited from the admin screen with the team password.
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte'
  import { absencesWithDays, type Preference, type PreferenceRule } from '../../schedule/preferences'
  import AdminUnlock from '../AdminUnlock.svelte'
  import { api, asTeam, call } from '../api'
  import { cached, remember } from '../cache.svelte'
  import { formatBalance, NEUTRAL_TEXT, PREFERENCE_TEXT, WEEKDAYS } from '../format'
  import { links } from '../router.svelte'
  import { session } from '../session.svelte'
  import AbsenceCalendar from './AbsenceCalendar.svelte'

  type Props = { devId?: number }
  let { devId }: Props = $props()

  const isAdminEdit = $derived(devId !== undefined)
  type Profile = Awaited<ReturnType<typeof loadProfile>>
  type ProfileAnswers = { profile: Profile; balance: number | null }
  // App re-creates the page for each dev ({#key}), so `devId` never changes under it.
  const cacheKey = untrack(() => (devId === undefined ? 'profile:me' : `profile:${devId}`))
  const remembered = cached<ProfileAnswers>(cacheKey)
  let profile = $state<Profile | null>(remembered?.profile ?? null)
  let balance = $state<number | null>(remembered?.balance ?? null)
  let nickname = $state(remembered?.profile.dev.nickname ?? '')

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
    rememberProfile()
  }

  function rememberProfile() {
    if (profile) remember<ProfileAnswers>(cacheKey, { profile, balance })
  }

  async function act(action: () => Promise<unknown>) {
    try {
      await action()
    } catch (failure) {
      toast.error((failure as Error).message)
    }
    await saved // a reload before the last change is saved would bring the old state back
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
    profile.rules = rules // shows the new state at once
    rememberProfile()
    saveRules(rules)
  }

  /**
   * Saves one after the other, so the last click wins even when answers arrive out of order. The
   * screen already shows the rules: it reloads only when a save fails (decisions #30).
   */
  let saved: Promise<void> = Promise.resolve()
  function saveInOrder(save: () => Promise<unknown>) {
    saved = saved.then(async () => {
      try {
        await save()
      } catch (failure) {
        toast.error((failure as Error).message)
        await load().catch((loadFailure) => toast.error((loadFailure as Error).message))
      }
    })
  }

  function saveRules(rules: PreferenceRule[]) {
    saveInOrder(() =>
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

  /** Shows the change at once, like the rules; the API keeps the periods merged the same way. */
  function setAbsenceDays(fromDate: string, toDate: string, absent: boolean) {
    if (!profile) return
    profile.absences = absencesWithDays(profile.absences, { fromDate, toDate }, absent)
    rememberProfile()
    const json = { fromDate, toDate, absent }
    saveInOrder(() =>
      devId === undefined
        ? call(api.api.me.absences.$put({ json }))
        : call(api.api.devs[':id'].absences.$put({ param: { id: String(devId) }, json }, asTeam())),
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
  <div class="mx-auto max-w-5xl space-y-8" role="status" aria-busy="true" aria-label="Carregando o perfil">
    <Skeleton class="h-8 w-64" />
    <div class="space-y-2">
      <Skeleton class="h-5 w-28" />
      <Skeleton class="h-6 w-72" />
    </div>
    <Skeleton class="h-14 w-full" />
    <div class="space-y-2">
      <Skeleton class="h-5 w-36" />
      <div class="grid grid-cols-7 gap-2">
        {#each WEEKDAYS as weekday (weekday)}
          <Skeleton class="h-14" />
        {/each}
      </div>
    </div>
    <div class="space-y-2">
      <Skeleton class="h-5 w-40" />
      <Skeleton class="h-80 w-full" />
    </div>
  </div>
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
      <h2 class="font-medium">Dias que não posso</h2>
      <p class="text-sm text-stone-500">
        Consulta, viagem, férias: nesses dias você não entra na escala. Toque num dia para marcar ou
        desmarcar; arraste para marcar vários.
      </p>
      <AbsenceCalendar
        absences={profile.absences}
        rosterMonths={profile.rosterMonths}
        onChange={setAbsenceDays}
      />
    </section>
  </div>
{/if}
