# Development

## Requirements

- [bun](https://bun.sh)
- A Cloudflare account (only to deploy; local dev runs offline)

## Local

```bash
bun install
bun run cf-typegen          # generates worker-configuration.d.ts (gitignored)
bun run db:migrate:local    # once there are migrations
bun run dev                 # http://localhost:5173 — /api/* goes to the Worker
```

`bun run dev` runs the Worker inside workerd with a local D1 stored in `.wrangler/`.

## First deploy

```bash
bunx wrangler login
bunx wrangler d1 create coruja        # copy the database_id into wrangler.jsonc
bun run cf-typegen
bun run db:migrate:remote
bun run deploy
```

Then attach the custom domain in the Cloudflare dashboard (Workers → coruja → Settings → Domains).
