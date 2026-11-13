<script lang="ts">
  // Asks for the team password once per tab (decisions #3) and checks it before showing admin screens.
  import { api, call } from './api'
  import { unlockAdmin } from './session.svelte'

  let password = $state('')
  let error = $state<string | null>(null)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    error = null
    try {
      await call(api.api.team.check.$get({}, { headers: { 'X-Team-Password': password } }))
      unlockAdmin(password)
    } catch (failure) {
      error = (failure as Error).message
    }
  }
</script>

<form class="mx-auto max-w-sm space-y-3 rounded-2xl border border-stone-200 bg-white p-6" onsubmit={submit}>
  <h1 class="text-lg font-semibold">Admin</h1>
  <p class="text-sm text-stone-500">
    Cadastrar devs, gerar tokens e editar o perfil de alguém pedem a senha do time.
  </p>
  <input
    type="password"
    bind:value={password}
    placeholder="Senha do time"
    autocomplete="current-password"
    class="w-full rounded-md border border-stone-300 bg-white px-3 py-2"
  >
  {#if error}
    <p class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
  {/if}
  <button type="submit" class="w-full rounded-md bg-stone-900 py-2 text-sm text-white">Desbloquear</button>
</form>
