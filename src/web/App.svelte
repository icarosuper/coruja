<script lang="ts">
  import { api } from './api'

  // Placeholder until the screens are decided (see docs/TODO.md).
  const health = api.api.health.$get().then((response) => response.json())
</script>

<p>Coruja</p>
{#await health then body}
  <p>API: {body.status}</p>
{/await}
