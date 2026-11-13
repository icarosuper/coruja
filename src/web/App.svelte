<script lang="ts">
  import LogInIcon from '@lucide/svelte/icons/log-in'
  import LogOutIcon from '@lucide/svelte/icons/log-out'
  import { ModeWatcher, setMode, userPrefersMode } from 'mode-watcher'
  import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte'
  import { Toaster } from '$lib/components/ui/sonner/index.js'
  import { defaultMonth } from '../schedule/calendar'
  import AdminPage from './admin/AdminPage.svelte'
  import { api, call } from './api'
  import { today } from './calendar'
  import { colorOf } from './format'
  import MonthPage from './month/MonthPage.svelte'
  import ProfilePage from './profile/ProfilePage.svelte'
  import { links, router } from './router.svelte'
  import { session, signOut } from './session.svelte'
  import TokenEntry from './TokenEntry.svelte'

  // Who the stored token belongs to; a token the API refuses signs out (see `call`).
  $effect(() => {
    const hasUnknownToken = session.token !== null && session.me === null
    if (hasUnknownToken) {
      call(api.api.me.$get())
        .then((profile) => {
          session.me = { id: profile.dev.id, nickname: profile.dev.nickname }
        })
        .catch(() => {})
    }
  })

  const THEMES = ['system', 'light', 'dark'] as const
  const THEME_LABEL = { system: 'Automático', light: 'Claro', dark: 'Escuro' }
  const THEME_ICON = { system: '🌓', light: '☀️', dark: '🌙' }
  const theme = $derived(userPrefersMode.current ?? 'system')
  const cycleTheme = () => setMode(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? 'system')

  const route = $derived(router.route)
  // Admin works without a dev token: that is how the first devs are created.
  const isAdminRoute = $derived(route.name === 'admin' || route.name === 'admin-dev')
  const needsSignIn = $derived(route.name === 'sign-in' || (session.token === null && !isAdminRoute))
  const NAV = [
    { href: links.month(), label: 'Escala', icon: '📅', isActive: () => route.name === 'month' },
    { href: links.profile, label: 'Meu perfil', icon: '👤', isActive: () => route.name === 'profile' },
    { href: links.admin, label: 'Admin', icon: '🔑', isActive: () => isAdminRoute },
  ]
</script>

<ModeWatcher />
<Toaster position="top-center" richColors />

<div class="min-h-screen bg-background text-foreground">
  {#if needsSignIn}
    <TokenEntry />
  {:else}
    <header class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2.5 sm:gap-6 sm:px-6 sm:py-3">
        <a href={links.month()} class="font-semibold">🦉 Coruja</a>
        <!-- Phones get the same links as a bottom tab bar (below). -->
        <nav class="hidden gap-2 text-[15px] font-medium md:flex">
          {#each NAV as item (item.href)}
            <a
              href={item.href}
              class="flex items-center gap-2 rounded-lg px-4 py-2 transition {item.isActive()
                ? 'bg-stone-900 text-white shadow-sm'
                : 'text-stone-700 hover:bg-stone-200 hover:text-stone-900'}"
              ><span aria-hidden="true">{item.icon}</span>{item.label}</a
            >
          {/each}
        </nav>
        <button
          type="button"
          onclick={cycleTheme}
          title="Tema: {THEME_LABEL[theme]}"
          aria-label="Tema: {THEME_LABEL[theme]}"
          class="ml-auto rounded-md border border-stone-200 px-2.5 py-1 text-[15px] text-stone-600 transition hover:bg-stone-100"
        >
          {THEME_ICON[theme]}<span class="ml-1 hidden sm:inline">{THEME_LABEL[theme]}</span>
        </button>
        <div class="flex items-center gap-2 text-[15px] whitespace-nowrap">
          {#if session.token}
            {#if session.me}
              <span class="max-w-32 truncate rounded-md px-2 py-0.5 font-medium {colorOf(session.me.id)}"
                >{session.me.nickname}</span
              >
            {:else}
              <Skeleton class="inline-block h-6 w-20 align-middle" />
            {/if}
            <a
              href={links.signIn}
              onclick={signOut}
              title="Sair"
              class="flex items-center gap-1.5 rounded-md border border-stone-200 px-2.5 py-1 text-stone-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              ><LogOutIcon class="size-4" /><span class="hidden sm:inline">Sair</span></a
            >
          {:else}
            <a
              href={links.signIn}
              class="flex items-center gap-1.5 rounded-md border border-stone-200 px-2.5 py-1 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
              ><LogInIcon class="size-4" />Entrar</a
            >
          {/if}
        </div>
      </div>
    </header>
    <nav
      class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {#each NAV as item (item.href)}
        <a
          href={item.href}
          class="flex flex-col items-center gap-0.5 py-2 text-xs font-medium {item.isActive()
            ? 'text-stone-900'
            : 'text-stone-500'}"
        >
          <span
            aria-hidden="true"
            class="rounded-full px-4 py-0.5 text-lg {item.isActive() ? 'bg-stone-200' : ''}"
            >{item.icon}</span
          >
          {item.label}
        </a>
      {/each}
    </nav>
    <main class="mx-auto max-w-[1600px] px-4 py-5 pb-28 sm:px-6 sm:py-6">
      {#if route.name === 'profile'}
        <ProfilePage />
      {:else if route.name === 'admin'}
        <AdminPage />
      {:else if route.name === 'admin-dev'}
        {#key route.devId}
          <ProfilePage devId={route.devId} />
        {/key}
      {:else if route.name === 'month'}
        {@const month = route.month ?? defaultMonth(today())}
        {#key month}
          <MonthPage {month} />
        {/key}
      {/if}
    </main>
  {/if}
</div>
