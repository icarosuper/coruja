# Development

## Requirements

- [bun](https://bun.sh)
- A Cloudflare account (only to deploy; local dev runs offline)

## Local

```bash
bun install
cp .dev.vars.example .dev.vars   # local secrets: TEAM_PASSWORD; optional APP_URL, NTFY_URL, NTFY_TOKEN
bun run cf-typegen          # generates worker-configuration.d.ts (gitignored)
bun run db:migrate:local
bun run dev                 # http://localhost:5173 — /api/* goes to the Worker
```

`bun run dev` runs the Worker inside workerd with a local D1 stored in `.wrangler/`.

### First run

Open http://localhost:5173, go to **Admin** (link on the sign-in screen), unlock with the
`TEAM_PASSWORD` from `.dev.vars`, add a few devs and copy one token. Sign in with it: the month
screen offers to open the current month with a suggested roster. To start from the real sheet,
import its CSV on that same empty month screen instead (decisions #16).

### Notifications (ntfy)

Off unless `.dev.vars` has `NTFY_URL` (and `NTFY_TOKEN` if the server needs it): the profile then
shows the QR code and the test button, and the Worker publishes to that server (decisions #32). Set
`APP_URL=http://localhost:5173` so the links in notifications open the local app. The cron that
sends shift reminders does not run by itself in `bun run dev`; fire it by hand:

```bash
curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```

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

Importing the first month from the sheet (decisions #16; refused once any month exists): add every
dev first, with the sheet's nicknames and their weights, then send the CSV decoded from
Windows-1252:

```bash
iconv -f WINDOWS-1252 -t UTF-8 sheet.csv | jq -Rs '{csv: .}' |
  curl -X POST $API/months/import -H "Authorization: Bearer $TOKEN" \
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

### Notifications (ntfy)

Optional, and done once for every dev (decisions #32). On the ntfy server, with anonymous read
allowed, give Coruja a user that may only publish to its topics and a token:

```bash
ntfy user add coruja
ntfy access coruja 'coruja-*' write-only
ntfy token add coruja
```

Then, on Cloudflare (the server must be reachable over HTTPS from the internet):

```bash
bunx wrangler secret put NTFY_URL     # e.g. https://ntfy.example.com
bunx wrangler secret put NTFY_TOKEN   # the token above
```

Topics need no setup: each dev's (`coruja-<nickname>`) exists as soon as something is published to
it. Without `NTFY_URL`, nothing is sent and the profile says notifications are not configured.

The custom domain is the `routes` entry in `wrangler.jsonc` (its zone must be on the same
Cloudflare account); the deploy creates its DNS record and certificate.

## Deploying changes

Every push to `master` deploys itself through **Workers Builds** (decisions #17), set up once in the
dashboard: Workers & Pages → `coruja` → Settings → Build → Connect the GitHub repo, production branch
`master`, build command `bun run build`, deploy command `bun run deploy:ci`. That command applies
the pending migrations to the production D1 and only then deploys (migrations go first and stay
backward compatible, decisions #17); a migration that fails stops the deploy.

`bun run deploy` still deploys the working tree by hand, for when the build is down (run
`bun run db:migrate:remote` first if it brings a migration).

### PR previews

Every other branch gets a **Worker Preview** (decisions #33) at
`<branch>-coruja.<subdomain>.workers.dev`, with its own database (`coruja-staging`, one for all
branches), its own team password and no notifications. Set up once:

1. Workers & Pages → `coruja` → Settings → Build: tick **Enable Preview Builds** and set the preview
   command to `bun run preview:ci` (applies migrations to staging, then `wrangler preview`). If the
   dashboard offers the one-time switch to Worker Previews, accept it (it cannot be undone; it does
   not touch production).
2. `preview_urls: true` (in `wrangler.jsonc`) reaches the Worker on the next deploy of `master`;
   until then previews exist but have no URL.
3. The previews' secrets live in the Preview base config, not in the Worker's:

   ```bash
   bunx wrangler preview base-config secret put TEAM_PASSWORD   # the previews' admin password
   ```

`coruja-staging` is used through `wrangler.staging.jsonc` (`wrangler d1` does not read the `previews`
block). To start it over with a made-up team and the current month open:

```bash
TEAM_PASSWORD=<previews' password> bun run staging:seed https://<branch>-coruja.<subdomain>.workers.dev
```

It empties every table, creates the devs through that preview's API and prints their tokens.
