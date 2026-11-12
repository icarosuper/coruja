import { defineConfig } from 'drizzle-kit'

// Only generates SQL migrations; wrangler applies them to D1 (`bun run db:migrate:local|remote`).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/worker/db/schema.ts',
  out: './migrations',
})
