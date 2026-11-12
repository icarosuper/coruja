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

### Trying the scheduler

```bash
bun run suggest scripts/example-team.json
```

Prints the suggested month as a calendar (`*` = 24h day, `+`/`-` = a good/avoid day for that dev,
`!` = nobody can take it) and a table of hours against each dev's weighted share. Copy the example,
change devs, weights, balances, rules (`"sun"`…`"sat"` or a day number), absences and day kinds, and
run it again. Name a file with the real team `something.local.json`: those are gitignored.

## First deploy

```bash
bunx wrangler login
bunx wrangler d1 create coruja        # copy the database_id into wrangler.jsonc
bun run cf-typegen
bun run db:migrate:remote
bun run deploy
```

Then attach the custom domain in the Cloudflare dashboard (Workers → coruja → Settings → Domains).
