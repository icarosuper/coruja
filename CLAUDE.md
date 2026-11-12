# CLAUDE.md

Navigation guide for Claude Code in this repo. Critical rules are here; the rest lives in `docs/`.

## Project

Coruja: the dev team's **on-call (sobreaviso) roster** for the Banking column of the manager's
monthly Excel sheet. Each dev keeps recurring preferences in a profile ("never on Sundays",
"Thursday is good", "never on the 5th"). On the 20th the next month opens with a roster already
suggested from those profiles, balancing hours across devs; each dev confirms it or edits it, and
once everyone has confirmed, someone runs the generated **Office Script** that fills the manager's
sheet. It replaces the monthly meeting where the sheet was filled by hand.

Infra and Sustentação are out of scope: they keep using the sheet directly.

**Status:** skeleton + database schema. No API, screens or scheduler yet — see [docs/TODO.md](docs/TODO.md).
Screens and visual design are decided with the user **before** they are coded.

## Commands

```bash
bun install
bun run cf-typegen          # regenerate worker-configuration.d.ts after editing wrangler.jsonc
bun run dev                 # Vite + Worker (workerd) + local D1, http://localhost:5173
bun run build
bun run typecheck           # svelte-check (web) + tsc (worker)
bun run check               # biome check (lint + format); add --write to fix
bun run test                # Vitest
bun run verify              # typecheck + check + test
bun run db:generate         # new SQL migration from src/worker/db/schema.ts (drizzle-kit)
bun run db:migrate:local    # apply migrations/ to the local D1
bun run deploy              # build + wrangler deploy (needs the real D1 id, see the guide)
```

Setup and deploy: [docs/guides/development.md](docs/guides/development.md).

## Stack

Cloudflare Workers (static assets + API in one deploy) · D1 (SQLite) · Drizzle · Hono · Svelte 5
SPA + Vite (`@cloudflare/vite-plugin`) · TypeScript 6 · bun · Biome · Vitest.

## Always-on rules

- **The web app never declares API types.** It calls the API through the typed Hono client
  (`src/web/api.ts`, `hc<AppType>`); request and response types come from the Worker's routes.
  Routes must stay **chained** on the app (or mounted with `.route()`) or the types are lost
  ([decisions.md #12](docs/agents/decisions.md#12-the-web-app-is-typed-from-the-api-hono-rpc)).

- **"Can't" is the only hard constraint** of the scheduler. Everything else (hour balance, weekend
  spread, preferences, back-to-back shifts) is a weighted goal, in the order of
  [decisions.md #6](docs/agents/decisions.md#6-scheduler-cant-is-hard-everything-else-is-ordered-goals).
- **The manager's sheet is not ours.** We only fill the Banking cells, through a generated Office
  Script that locates columns by date and team label, never by fixed position
  ([#4](docs/agents/decisions.md#4-excel-is-filled-by-a-generated-office-script)).
- **Secrets stay secret.** Dev tokens are stored hashed; the team password is a Worker secret
  (`TEAM_PASSWORD`). Neither is ever logged or returned after creation
  ([#3](docs/agents/decisions.md#3-auth-is-one-token-per-dev-plus-a-team-password)).
- **Do not hand-edit generated files:** `worker-configuration.d.ts` (`bun run cf-typegen`) and
  the SQL in `migrations/` (`bun run db:generate`).
- **Real names stay out of the repo.** Devs are identified by nickname only; no CSV/XLSX from the
  real sheet is committed (they are in `.gitignore`).

## Language: English only

Everything in the repo is in English: code, comments, docs, file names, commit messages.
(Conversation with the user is in Portuguese; the repo is not.) **Exceptions, in Portuguese:** UI
strings, and what colleagues read or fill in on GitHub — `CONTRIBUTING.md`, issue and PR templates
in `.github/`. The users and contributors are the Brazilian dev team.

## Readability

- **Named variable instead of an inline expression.** The result of a check, query or async call
  gets a name before it enters a condition.

  ```ts
  // ✅
  const isWeekendShift = WEEKEND_DAYS.includes(shift.weekday)
  if (isWeekendShift) return FULL_DAY_HOURS

  // ❌
  if (WEEKEND_DAYS.includes(shift.weekday)) return FULL_DAY_HOURS
  ```

- **Complex logic becomes a named function.** If a block needs a comment to explain itself, it
  needs a name.
- **A name says "what", not "how".** No abbreviations, no single-letter names (except loop
  indices), no generic names (`result`, `data`, `temp`).
- **The formatter decides formatting** — `bun run check`. 2 spaces, single quotes, no semicolons,
  110 columns.

## Commit style

Conventional Commits, in English, subject line only — no body, no scope, no `Co-Authored-By`, no
trailing period. `<type>: <imperative verb> <complement>`, lowercase after the type, up to ~72
chars. Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

The subject states the behavior, not the file: describe the rule that now holds.

## Branch and PRs

- **The user** commits straight to `master` by default. For a larger feature that takes several
  commits, **ask first** whether the user wants a branch.
- **Anyone else** (colleagues, and their agents) works on a branch and opens a PR. Merges are
  squash-only and the **PR title becomes the commit subject**, so it follows the commit style below;
  CI checks it. Contributor guide: [CONTRIBUTING.md](CONTRIBUTING.md).
- CI (`.github/workflows/ci.yml`) runs `bun run verify` and the build on every push and PR.
- **Every merge to `master` ships to production** (rolling release). A migration must work with the
  previous code too — never drop or rename what the current code reads in the same change
  ([decisions.md #17](docs/agents/decisions.md#17-rolling-release-from-master-migrations-stay-backward-compatible)).

## Never commit without an explicit request

1. Implement the change
2. Run `bun run verify`
3. Show what changed and **suggest one** commit title
4. Wait for the user to approve or ask for the commit

## Bad code along the way

Found bad code **near** what you are touching — badly written, deprecated, unused, duplicated, a
comment lying about the code — **ask before acting**, always offering the three options:

1. **fix it now**
2. **just leave a TODO** (in the code, next to it)
3. **ignore it**

Never pick one on your own. Say what it is, where (`file:line`) and why it is bad in one or two
lines, and ask. What the user's request already covers is not "along the way", it is the work.

## What to read when

Read the doc **before** the task it describes.

- **[docs/agents/architecture.md](docs/agents/architecture.md)** — before touching the schema, the
  scheduler, the month lifecycle, holidays or the export. Domain model, flow, invariants, what bites.
- **[docs/agents/conventions.md](docs/agents/conventions.md)** — before writing code: layout,
  API routes, where logic goes.
- **[docs/agents/features-index.md](docs/agents/features-index.md)** — when looking for "where is
  X", or before adding a feature.
- **[docs/agents/decisions.md](docs/agents/decisions.md)** — before "fixing" something that looks
  wrong. Start from the index; read only the entry it points to.
- **[docs/TODO.md](docs/TODO.md)** — open questions and the build order.

## After any change

1. `bun run verify`.
2. **Update the affected docs in the same change:**
   - new/removed route, endpoint, screen or MCP tool → `docs/agents/features-index.md`
   - schema, flow, layout or an invariant changed → `docs/agents/architecture.md`
   - a non-obvious choice made → new entry in `docs/agents/decisions.md` (next number + one line
     in the index; never renumber)
   - closed or discovered work → `docs/TODO.md` (delete closed items; git keeps the history)
   - command, binding or setup step changed → this file, `docs/guides/development.md` and, if it
     affects contributors, `CONTRIBUTING.md` and the CI workflow
3. Suggest the commit title and stop.
