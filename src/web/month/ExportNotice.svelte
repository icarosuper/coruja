<script lang="ts">
  // What to do with the export that just happened.
  type Props = {
    notice: { kind: 'script'; script: string; copied: boolean } | { kind: 'grid' }
    onClose: () => void
  }
  let { notice, onClose }: Props = $props()

  let copiedByHand = $state(false)
  async function copyAgain(script: string) {
    copiedByHand = await navigator.clipboard.writeText(script).then(
      () => true,
      () => false,
    )
  }
</script>

<div class="flex items-start gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
  <div class="min-w-0 flex-1 space-y-2">
    {#if notice.kind === 'script'}
      {#if notice.copied || copiedByHand}
        <p>
          ✓ Script copiado. No Excel, abra a aba do mês: <b>Automatizar → Novo script</b>, cole e clique em
          <b>Executar</b>.
        </p>
      {:else}
        <p>
          O navegador não deixou copiar sozinho.
          <button type="button" class="font-medium underline" onclick={() => copyAgain(notice.script)}>
            Copiar o script
          </button>
          e cole no Excel em <b>Automatizar → Novo script</b>.
        </p>
      {/if}
    {:else}
      <p>
        ✓ Tabela baixada. Abra, copie a partir da célula <b>B3</b> até o fim e, na planilha do gestor, use
        <b>Colar especial → Ignorar em branco</b>
        na mesma posição: só as células do Banking mudam.
      </p>
    {/if}
  </div>
  <button type="button" aria-label="Fechar aviso" class="px-1 text-emerald-700" onclick={onClose}>✕</button>
</div>
