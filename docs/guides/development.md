# Development

## Requirements

- [bun](https://bun.sh)
- A Cloudflare account (only to deploy; local dev runs offline)

## Local

```bash
bun install
cp .dev.vars.example .dev.vars   # local secrets: TEAM_PASSWORD
bun run cf-typegen          # generates worker-configuration.d.ts (gitignored)
bun run db:migrate:local
bun run dev                 # http://localhost:5173 — /api/* goes to the Worker
```

`bun run dev` runs the Worker inside workerd with a local D1 stored in `.wrangler/`.

### First run

Open http://localhost:5173, go to **Admin** (link on the sign-in screen), unlock with the
`TEAM_PASSWORD` from `.dev.vars`, add a few devs and copy one token. Sign in with it: the month
screen offers to open the current month with a suggested roster. To start from the real sheet,
import its CSV on the admin screen instead (decisions #16).

### Using the API by hand

The API can also be driven with curl. Admin calls take the team password, the rest a dev token:

```bash
API=http://localhost:5173/api
# add a dev: answers { dev, token } — the token is shown only here
curl -X POST $API/devs -H 'X-Team-Password: change-me' -H 'content-type: application/json' \
  -d '{"nickname": "owl", "weight": 100}'
TOKEN=coruja_...
curl $API/months -H "Authorization: Bearer $TOKEN"
curl -X POST $API/months/2026-12/open -H "Authorization: Bearer $TOKEN"
```

Importing a month from the sheet (decisions #16): add every dev first, with the sheet's nicknames
and their weights, then send the CSV decoded from Windows-1252:

```bash
iconv -f WINDOWS-1252 -t UTF-8 sheet.csv | jq -Rs '{csv: .}' |
  curl -X POST $API/months/import -H 'X-Team-Password: change-me' \
    -H 'content-type: application/json' --data-binary @-
```

Every route is listed in [features-index.md](../agents/features-index.md#api-routes).

### Trying the scheduler

```bash
bun run suggest scripts/example-team.json
```

Prints the suggested month as a calendar (`*` = 24h day, `+`/`-` = a good/avoid day for that dev,
`!` = nobody can take it) and a table of hours against each dev's weighted share. Copy the example,
change devs, weights, balances, weekday rules (`"sun"`…`"sat"`), absences and day kinds, and
run it again. Name a file with the real team `something.local.json`: those are gitignored.

## First deploy

```bash
bunx wrangler login
bunx wrangler d1 create coruja        # copy the database_id into wrangler.jsonc (done for production)
bun run cf-typegen
bun run db:migrate:remote
bunx wrangler secret put TEAM_PASSWORD   # the team password (decisions #3)
bun run deploy
```

The custom domain is the `routes` entry in `wrangler.jsonc` (its zone must be on the same
Cloudflare account); the deploy creates its DNS record and certificate.

## Deploying changes

Every push to `master` deploys itself through **Workers Builds** (decisions #17), set up once in the
dashboard: Workers & Pages → `coruja` → Settings → Build → Connect the GitHub repo, production branch
`master`, build command `bun run build`, deploy command `npx wrangler deploy`. Preview builds are
off: other branches would get a preview that talks to the production D1 (staging is in
`docs/TODO.md`).

Workers Builds ships code only. A migration goes to D1 by hand, **before** the push that needs it:

```bash
bun run db:migrate:remote
```

`bun run deploy` still deploys the working tree by hand, for when the build is down.
