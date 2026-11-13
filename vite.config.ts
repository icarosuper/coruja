import { cloudflare } from '@cloudflare/vite-plugin'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), svelte(), cloudflare()],
  // `$lib` is where shadcn-svelte puts its components (components.json).
  resolve: { alias: { $lib: `${import.meta.dirname}/src/web/lib` } },
})
