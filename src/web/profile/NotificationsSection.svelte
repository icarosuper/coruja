<script lang="ts">
  // The profile's "Notificações" (decisions #32): the QR to subscribe to the dev's ntfy topic, a test,
  // and what to be told about. Every change saves at once, like the weekday rules.
  import CircleHelpIcon from '@lucide/svelte/icons/circle-help'
  import CopyIcon from '@lucide/svelte/icons/copy'
  import SendIcon from '@lucide/svelte/icons/send'
  import { renderSVG } from 'uqr'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Switch from '$lib/components/ui/switch/switch.svelte'
  import type { NotificationSettings, NotificationView } from './types'

  type Props = {
    notifications: NotificationView
    onChange: (settings: NotificationSettings) => void
    onTest: () => Promise<void>
  }
  let { notifications, onChange, onTest }: Props = $props()

  const subscription = $derived(notifications.subscription)
  // Black on white whatever the theme: dark mode redefines the palette, a QR reader does not.
  const qrSvg = $derived(
    subscription ? renderSVG(subscription.appUrl, { whiteColor: '#ffffff', blackColor: '#000000' }) : '',
  )
  const serverOrigin = $derived(subscription ? new URL(subscription.webUrl).origin : '')
  let isHelpOpen = $state(false)
  let isTesting = $state(false)

  function change(changes: Partial<NotificationSettings>) {
    onChange({ ...notifications.settings, ...changes })
  }

  async function copyLink() {
    if (!subscription) return
    const copied = await navigator.clipboard.writeText(subscription.webUrl).then(
      () => true,
      () => false,
    )
    if (copied) showCopied()
    else window.prompt('Copie o link:', subscription.webUrl)
  }

  let copiedRecently = $state(false)
  function showCopied() {
    copiedRecently = true
    setTimeout(() => (copiedRecently = false), 2000)
  }

  async function test() {
    isTesting = true
    await onTest()
    isTesting = false
  }
</script>

{#snippet toggle(
  id: string,
  label: string,
  checked: boolean,
  onToggle: (checked: boolean) => void,
  detail?: string,
)}
  <div class="flex items-center gap-3 text-sm">
    <Switch {id} {checked} onCheckedChange={onToggle} />
    <label for={id} class="cursor-pointer">
      {label}
      {#if detail}
        <span class="block text-xs text-stone-500">{detail}</span>
      {/if}
    </label>
  </div>
{/snippet}

{#snippet timedToggle(
  id: string,
  label: string,
  enabled: boolean,
  time: string,
  onToggle: (checked: boolean) => void,
  onTime: (time: string) => void,
)}
  <div class="flex flex-wrap items-center gap-3 text-sm">
    <Switch {id} checked={enabled} onCheckedChange={onToggle} />
    <label for={id} class="cursor-pointer">{label}</label>
    <input
      type="time"
      value={time}
      disabled={!enabled}
      required
      aria-label="Horário: {label}"
      onchange={(event) => event.currentTarget.value && onTime(event.currentTarget.value)}
      class="rounded-md border border-stone-300 bg-white px-2 py-1 tabular-nums disabled:opacity-50"
    >
  </div>
{/snippet}

<section class="space-y-4">
  <h2 class="font-medium">Notificações</h2>

  {#if !subscription}
    <p class="text-sm text-stone-500">Notificações não configuradas pelo admin.</p>
  {:else}
    <div class="flex flex-wrap items-start gap-4">
      <div class="flex flex-col items-center gap-2">
        <div
          class="size-40 rounded-lg p-2 ring-1 ring-stone-200 [&>svg]:size-full"
          style="background: #ffffff"
          role="img"
          aria-label="QR code para assinar {subscription.topic} no app ntfy"
        >
          <!-- An SVG uqr builds here from our own link: no outside markup. -->
          {@html qrSvg}
        </div>
        <button
          type="button"
          onclick={copyLink}
          class="flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-sm font-medium hover:bg-stone-50"
        >
          <CopyIcon class="size-4" />{copiedRecently ? 'Copiado!' : 'Copiar link'}
        </button>
      </div>
      <div class="max-w-xs space-y-3 text-sm text-stone-600">
        <p>
          Assine <b class="font-mono text-stone-900">{subscription.topic}</b> no app ntfy para receber os
          avisos dos seus turnos no celular.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onclick={test}
            disabled={isTesting}
            class="flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 font-medium text-stone-900 hover:bg-stone-50 disabled:opacity-50"
          >
            <SendIcon class="size-4" />Enviar teste
          </button>
          <button
            type="button"
            onclick={() => (isHelpOpen = true)}
            class="flex items-center gap-1.5 rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100"
          >
            <CircleHelpIcon class="size-4" />Ajuda
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="space-y-3">
    <h3 class="text-sm font-medium text-stone-700">Quando avisar</h3>
    {@render timedToggle(
      'notify-eve',
      'Na véspera do turno, às',
      notifications.settings.eveEnabled,
      notifications.settings.eveTime,
      (eveEnabled) => change({ eveEnabled }),
      (eveTime) => change({ eveTime }),
    )}
    {@render timedToggle(
      'notify-day',
      'No dia do turno, às',
      notifications.settings.dayEnabled,
      notifications.settings.dayTime,
      (dayEnabled) => change({ dayEnabled }),
      (dayTime) => change({ dayTime }),
    )}
    {@render toggle(
      'notify-shift-start',
      'Quando o turno começa',
      notifications.settings.shiftStartEnabled,
      (shiftStartEnabled) => change({ shiftStartEnabled }),
      '18:00 em dia útil, 09:00 em fim de semana e feriado',
    )}
  </div>

  <div class="space-y-3">
    <h3 class="text-sm font-medium text-stone-700">Outros avisos</h3>
    {@render toggle(
      'notify-shift-changed',
      'Quando alguém mudar um turno meu',
      notifications.settings.shiftChangedEnabled,
      (shiftChangedEnabled) => change({ shiftChangedEnabled }),
    )}
    {@render toggle(
      'notify-month-opened',
      'Quando um mês for aberto e faltar minha confirmação',
      notifications.settings.monthOpenedEnabled,
      (monthOpenedEnabled) => change({ monthOpenedEnabled }),
    )}
  </div>
</section>

{#if subscription}
  <Dialog.Root bind:open={isHelpOpen}>
    <Dialog.Content class="max-w-md gap-4 text-base">
      <Dialog.Header>
        <Dialog.Title class="text-lg font-semibold">Como receber os avisos</Dialog.Title>
        <Dialog.Description class="text-sm text-stone-600">
          Os avisos chegam pelo app ntfy, no servidor do time.
        </Dialog.Description>
      </Dialog.Header>
      <ol class="list-decimal space-y-2 pl-5 text-sm text-stone-700">
        <li>
          Instale o ntfy:
          <a
            class="text-sky-700 underline"
            href="https://play.google.com/store/apps/details?id=io.heckel.ntfy"
            target="_blank"
            rel="noreferrer"
            >Google Play</a
          >,
          <a
            class="text-sky-700 underline"
            href="https://f-droid.org/en/packages/io.heckel.ntfy/"
            target="_blank"
            rel="noreferrer"
            >F-Droid</a
          >
          ou
          <a
            class="text-sky-700 underline"
            href="https://apps.apple.com/us/app/ntfy/id1625396347"
            target="_blank"
            rel="noreferrer"
            >App Store</a
          >.
        </li>
        <li><b>Android:</b> leia o QR code com a câmera. O app abre e já assina o tópico.</li>
        <li>
          <b>iPhone</b>
          (ou se o QR não abrir o app): no ntfy, toque em <b>+</b>, digite o tópico
          <b class="font-mono">{subscription.topic}</b>, marque <b>Usar outro servidor</b> e informe
          <b class="font-mono">{serverOrigin}</b>.
        </li>
        <li>No computador, o link copiado (<b>Copiar link</b>) abre o tópico no ntfy pelo navegador.</li>
        <li>Toque em <b>Enviar teste</b> aqui no perfil para conferir.</li>
      </ol>
      <p class="text-sm text-stone-500">
        Para receber menos, desligue o que não quiser em <b>Quando avisar</b> e <b>Outros avisos</b>. Para não
        receber nada, cancele a assinatura do tópico no app.
      </p>
    </Dialog.Content>
  </Dialog.Root>
{/if}
