<script lang="ts">
  // First screen: the personal token, pasted once; it stays in this browser.
  import { api, call } from './api'
  import { links } from './router.svelte'
  import { signIn } from './session.svelte'

  let token = $state('')
  let error = $state<string | null>(null)
  let isChecking = $state(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const typed = token.trim()
    if (!typed) return
    isChecking = true
    error = null
    try {
      const profile = await call(api.api.me.$get({}, { headers: { Authorization: `Bearer ${typed}` } }))
      signIn(typed, { id: profile.dev.id, nickname: profile.dev.nickname })
      location.hash = links.month()
    } catch (failure) {
      error = (failure as Error).message
    } finally {
      isChecking = false
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center p-4">
  <form
    class="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    onsubmit={submit}
  >
    <div class="text-center">
      <div class="text-4xl">🦉</div>
      <h1 class="mt-2 text-xl font-semibold">Coruja</h1>
      <p class="text-sm text-stone-500">Escala de sobreaviso do Banking</p>
    </div>
    <label class="block space-y-1 text-sm">
      <span>Seu token</span>
      <input
        type="password"
        bind:value={token}
        placeholder="coruja_…"
        autocomplete="current-password"
        class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono"
      >
    </label>
    {#if error}
      <p class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
    {/if}
    <button
      type="submit"
      disabled={isChecking}
      class="w-full rounded-md bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {isChecking ? 'Conferindo…' : 'Entrar'}
    </button>
    <p class="text-xs text-stone-500">
      Não tem token? Peça para quem tem a senha do time gerar um na
      <a href={links.admin} class="underline">área de admin</a>. O token fica salvo só neste navegador.
    </p>
  </form>
</div>
