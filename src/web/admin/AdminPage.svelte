<script lang="ts">
  // Admin, behind the team password: devs, tokens, and the manager's sheet (import, diff, sync).
  import type { InferResponseType } from 'hono/client'
  import { toast } from 'svelte-sonner'
  import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte'
  import type { DayKind } from '../../schedule/shifts'
  import AdminUnlock from '../AdminUnlock.svelte'
  import { api, asTeam, call } from '../api'
  import { cached, remember } from '../cache.svelte'
  import { colorOf, dayLabel, formatBalance, monthName, segmentLabel } from '../format'
  import type { Dev } from '../month/types'
  import { links } from '../router.svelte'
  import { lockAdmin, session } from '../session.svelte'
  import { readSheet } from '../sheet'

  type Differences = InferResponseType<(typeof api.api.months)['sheet-diff']['$post'], 200>['differences']

  const CACHE_KEY = 'admin'
  const SKELETON_ROWS = 4
  type AdminAnswers = { devs: Dev[] }
  const remembered = cached<AdminAnswers>(CACHE_KEY)
  let isLoaded = $state(remembered !== null)
  let devs = $state<Dev[]>(remembered?.devs ?? [])
  let newNickname = $state('')
  let shownToken = $state<{ nickname: string; token: string } | null>(null)

  let sheetFile = $state<File | null>(null)
  let differences = $state<{ month: string; list: Differences } | null>(null)
  let appliedCount = $state<number | null>(null)

  async function load() {
    const devList = await call(api.api.devs.$get({}, asTeam()))
    remember<AdminAnswers>(CACHE_KEY, { devs: devList })
    devs = devList
    isLoaded = true
  }

  async function act(action: () => Promise<unknown>) {
    try {
      await action()
    } catch (failure) {
      toast.error((failure as Error).message)
    }
    await load().catch((failure) => toast.error((failure as Error).message))
  }

  $effect(() => {
    if (session.teamPassword !== null) load().catch((failure) => toast.error((failure as Error).message))
  })

  function addDev(event: SubmitEvent) {
    event.preventDefault()
    const nickname = newNickname.trim()
    if (!nickname) return
    act(async () => {
      const created = await call(api.api.devs.$post({ json: { nickname, weight: 100 } }, asTeam()))
      shownToken = { nickname: created.dev.nickname, token: created.token }
      newNickname = ''
    })
  }

  function generateToken(dev: Dev) {
    act(async () => {
      const issued = await call(api.api.devs[':id'].token.$post({ param: { id: String(dev.id) } }, asTeam()))
      shownToken = { nickname: dev.nickname, token: issued.token }
    })
  }

  function setActive(dev: Dev, active: boolean) {
    act(() => call(api.api.devs[':id'].$patch({ param: { id: String(dev.id) }, json: { active } }, asTeam())))
  }

  function compareWithSheet() {
    const file = sheetFile
    if (!file) return
    appliedCount = null
    differences = null
    act(async () => {
      const csv = await readSheet(file)
      const found = await call(api.api.months['sheet-diff'].$post({ json: { csv } }))
      differences = { month: found.month, list: found.differences }
    })
  }

  function applyDifferences() {
    const pending = differences
    if (!pending) return
    act(async () => {
      const changes = pending.list.map((difference) => ({ date: difference.date, ...difference.after }))
      const applied = await call(
        api.api.months[':month'].changes.$post({ param: { month: pending.month }, json: { changes } }),
      )
      appliedCount = applied.changedDates.length
      differences = null
    })
  }

  type LoggedDay = { kind: DayKind; segments: { devId: number; fromHour: number; toHour: number }[] }
  const nicknameOf = (devId: number) => devs.find((dev) => dev.id === devId)?.nickname ?? '?'
  const describeDay = (day: LoggedDay) =>
    `${day.kind === 'day_off' ? '24h' : '15h'} · ${
      day.segments
        .map(
          (segment) =>
            `${nicknameOf(segment.devId)} ${segmentLabel(day.kind, segment.fromHour, segment.toHour)}`,
        )
        .join(', ') || 'ninguém'
    }`
</script>

{#if session.teamPassword === null}
  <AdminUnlock />
{:else}
  <div class="mx-auto max-w-4xl space-y-8">
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-semibold">Devs</h1>
        <button type="button" class="ml-auto text-sm text-stone-500 underline" onclick={lockAdmin}>
          bloquear admin
        </button>
      </div>
      {#if shownToken}
        <div class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p>
            Token de <b>{shownToken.nickname}</b> — copie e mande para a pessoa.
            <b>Ele não aparece de novo.</b>
          </p>
          <div class="mt-2 flex gap-2">
            <code class="min-w-0 flex-1 rounded bg-white px-2 py-1 font-mono break-all"
              >{shownToken.token}</code
            >
            <button
              type="button"
              class="rounded-md border border-stone-300 bg-white px-3"
              onclick={() =>
                navigator.clipboard
                  .writeText(shownToken?.token ?? '')
                  .then(() => toast.success('Token copiado.'))}
            >
              Copiar
            </button>
            <button
              type="button"
              aria-label="Fechar"
              class="px-2 text-stone-500"
              onclick={() => (shownToken = null)}
            >
              ✕
            </button>
          </div>
        </div>
      {/if}

      <div class="hidden overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm md:block">
        <table class="w-full text-sm">
          <thead
            class="border-b border-stone-200 bg-stone-100 text-left text-xs font-medium tracking-wide text-stone-600 uppercase"
          >
            <tr>
              <th class="px-4 py-2.5 font-medium">Apelido</th>
              <th class="px-3 font-medium">Peso</th>
              <th class="px-3 font-medium">Saldo</th>
              <th class="px-3 font-medium">Token</th>
              <th class="px-3 font-medium">Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#if !isLoaded}
              {#each Array.from({ length: SKELETON_ROWS }) as _, index (index)}
                <tr>
                  <td colspan="6" class="px-4 py-3"><Skeleton class="h-6 w-full" /></td>
                </tr>
              {/each}
            {/if}
            {#each devs as dev (dev.id)}
              <tr
                class="transition-colors even:bg-stone-50 hover:bg-sky-50 {dev.active
                  ? ''
                  : 'text-stone-400'}"
              >
                <td class="px-4 py-3">
                  <span
                    class="inline-block max-w-40 truncate rounded px-1.5 py-0.5 align-middle text-xs font-medium {colorOf(
                      dev.id,
                    )}"
                    >{dev.nickname}</span
                  >
                </td>
                <td class="px-3">{dev.weight}%</td>
                <td class="px-3 tabular-nums">{formatBalance(dev.balance)}</td>
                <td class="px-3">{dev.hasToken ? 'tem' : '— nunca gerado'}</td>
                <td class="px-3">
                  <input
                    type="checkbox"
                    checked={dev.active}
                    aria-label="Ativo"
                    onchange={(event) => setActive(dev, event.currentTarget.checked)}
                  >
                </td>
                <td class="pr-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    class="text-sky-700 hover:underline"
                    onclick={() => generateToken(dev)}
                  >
                    {dev.hasToken ? 'gerar novo token' : 'gerar token'}
                  </button>
                  <a href={links.adminDev(dev.id)} class="ml-3 text-sky-700 hover:underline">editar perfil</a>
                </td>
              </tr>
            {:else}
              {#if isLoaded}
                <tr>
                  <td colspan="6" class="px-4 py-6 text-center text-stone-500">Nenhum dev ainda.</td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
      <!-- Phones: one card per dev instead of the table. -->
      <ul class="space-y-2 md:hidden">
        {#if !isLoaded}
          {#each Array.from({ length: SKELETON_ROWS }) as _, index (index)}
            <li><Skeleton class="h-20 w-full rounded-xl" /></li>
          {/each}
        {/if}
        {#each devs as dev (dev.id)}
          <li
            class="rounded-xl border border-stone-200 bg-white p-3 text-sm shadow-sm {dev.active
              ? ''
              : 'text-stone-400'}"
          >
            <div class="flex items-center gap-2">
              <span class="max-w-40 truncate rounded px-1.5 py-0.5 font-medium {colorOf(dev.id)}"
                >{dev.nickname}</span
              >
              <span class="text-stone-500">{dev.weight}% · saldo {formatBalance(dev.balance)}</span>
              <label class="ml-auto flex items-center gap-1.5 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={dev.active}
                  onchange={(event) => setActive(dev, event.currentTarget.checked)}
                >
                ativo
              </label>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-stone-500">
              <span>{dev.hasToken ? 'tem token' : 'token nunca gerado'}</span>
              <button type="button" class="py-1 text-sky-700" onclick={() => generateToken(dev)}>
                {dev.hasToken ? 'gerar novo token' : 'gerar token'}
              </button>
              <a href={links.adminDev(dev.id)} class="py-1 text-sky-700">editar perfil</a>
            </div>
          </li>
        {/each}
      </ul>

      <form class="flex gap-2 text-sm" onsubmit={addDev}>
        <input
          bind:value={newNickname}
          placeholder="Apelido do novo dev"
          maxlength="20"
          class="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 sm:flex-none"
        >
        <button type="submit" class="rounded-md bg-stone-900 px-3 py-1.5 text-white">Cadastrar</button>
      </form>
      <p class="text-xs text-stone-500">
        Quem entra começa com o saldo médio do time, para não pegar tudo no primeiro mês. Gerar um token novo
        invalida o antigo.
      </p>
    </section>

    <section class="space-y-3">
      <h2 class="text-xl font-semibold">Planilha do gestor</h2>
      <p class="text-sm text-stone-500">
        Exporte a aba do mês como CSV. Se o gestor mudou algo direto na planilha, aqui dá para ver a diferença
        e trazer para o Coruja.
      </p>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <label
          class="flex cursor-pointer items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50"
        >
          <span>📄</span>
          <span class={sheetFile ? '' : 'text-stone-500'}>{sheetFile?.name ?? 'Escolher arquivo .csv…'}</span>
          <input
            type="file"
            accept=".csv"
            class="sr-only"
            onchange={(event) => (sheetFile = event.currentTarget.files?.[0] ?? null)}
          >
        </label>
        <button
          type="button"
          disabled={sheetFile === null || session.token === null}
          class="rounded-md bg-stone-900 px-3 py-1.5 text-white disabled:opacity-30"
          onclick={compareWithSheet}
        >
          Ver diferenças
        </button>
      </div>
      {#if session.token === null}
        <p class="text-xs text-stone-500">Para comparar com a planilha, entre com o seu token.</p>
      {/if}

      {#if differences}
        {#if differences.list.length === 0}
          <p class="text-sm text-emerald-700">
            ✓ A planilha e o Coruja estão iguais em {monthName(differences.month)}.
          </p>
        {:else}
          <div class="rounded-xl border border-stone-200 bg-white">
            <p class="px-4 pt-3 text-sm font-medium">{monthName(differences.month)}</p>
            <table class="w-full text-sm">
              <thead class="text-left text-xs text-stone-500">
                <tr>
                  <th class="px-4 py-2 font-normal">Dia</th>
                  <th class="font-normal">No Coruja</th>
                  <th class="font-normal">Na planilha</th>
                </tr>
              </thead>
              <tbody>
                {#each differences.list as difference (difference.date)}
                  <tr class="border-t border-stone-100">
                    <td class="px-4 py-2 align-top">{dayLabel(difference.date)}</td>
                    <td class="py-2 pr-2 align-top text-rose-700 line-through">
                      {describeDay(difference.before)}
                    </td>
                    <td class="py-2 pr-4 align-top text-emerald-700">{describeDay(difference.after)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            <div class="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 p-3 text-sm">
              <span class="mr-auto basis-full text-xs text-stone-500 sm:basis-auto"
                >Antes da exportação, quem tiver horas mudadas precisa confirmar de novo.</span
              >
              <button
                type="button"
                class="rounded-md px-3 py-1.5 hover:bg-stone-100"
                onclick={() => (differences = null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                class="rounded-md bg-emerald-600 px-3 py-1.5 text-white"
                onclick={applyDifferences}
              >
                Aplicar {differences.list.length}
                {differences.list.length === 1 ? 'mudança' : 'mudanças'}
              </button>
            </div>
          </div>
        {/if}
      {:else if appliedCount !== null}
        <p class="text-sm text-emerald-700">
          ✓ {appliedCount}
          {appliedCount === 1 ? 'dia atualizado' : 'dias atualizados'}. Está no histórico do mês.
        </p>
      {/if}
    </section>
  </div>
{/if}
