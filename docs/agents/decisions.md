# Decisions

Choices that look wrong (or arbitrary) but are intentional. Read before "fixing" one of them.

## Index

Entries are **self-contained**: read only the one you were pointed at. Cite by **anchor**, never by
line number. A new entry takes the **next number** (highest today is **#17**) plus one line here;
never renumber.

- [**#1** — Only the dev team's Banking column; devs are nicknames](#1-only-the-dev-teams-banking-column-devs-are-nicknames)
- [**#2** — One shift per day, anchored on its start; every hour weighs the same](#2-one-shift-per-day-anchored-on-its-start-every-hour-weighs-the-same)
- [**#3** — Auth is one token per dev plus a team password](#3-auth-is-one-token-per-dev-plus-a-team-password)
- [**#4** — Excel is filled by a generated Office Script](#4-excel-is-filled-by-a-generated-office-script)
- [**#5** — Preferences are recurring profile rules; month exceptions are calendar edits](#5-preferences-are-recurring-profile-rules-month-exceptions-are-calendar-edits)
- [**#6** — Scheduler: "can't" is hard, everything else is ordered goals](#6-scheduler-cant-is-hard-everything-else-is-ordered-goals)
- [**#7** — Months open on the 20th with a suggestion and close manually](#7-months-open-on-the-20th-with-a-suggestion-and-close-manually)
- [**#8** — Everything runs in one Cloudflare Worker with D1](#8-everything-runs-in-one-cloudflare-worker-with-d1)
- [**#9** — Manager targets and "compensação" are out of scope](#9-manager-targets-and-compensacao-are-out-of-scope)
- [**#10** — Microsoft integrations without admin consent](#10-microsoft-integrations-without-admin-consent)
- [**#11** — Svelte SPA with Hono as the only API](#11-svelte-spa-with-hono-as-the-only-api)
- [**#12** — The web app is typed from the API (Hono RPC)](#12-the-web-app-is-typed-from-the-api-hono-rpc)
- [**#13** — Drizzle for D1](#13-drizzle-for-d1)
- [**#14** — Holidays are São Paulo city's, computed in code and overridable](#14-holidays-are-sao-paulo-citys-computed-in-code-and-overridable)
- [**#15** — Hours are counted by calendar hour](#15-hours-are-counted-by-calendar-hour)
- [**#16** — The starting balance comes from the November 2026 CSV](#16-the-starting-balance-comes-from-the-november-2026-csv)
- [**#17** — Rolling release from master; migrations stay backward compatible](#17-rolling-release-from-master-migrations-stay-backward-compatible)

---

### 1. Only the dev team's Banking column; devs are nicknames

The manager's sheet has three columns per day (Sustentação, Banking, Infra). Coruja handles only
Banking, which is the dev team's rotation. Sustentação only carries "Expediente" markers and Infra
is another team. Devs are stored by the short nickname used in the sheet, with no
full name or email.

**Don't "fix" by:** adding Infra/Sustentação to the scheduler, or adding emails "for notifications"
(see #10 for why mentions are not needed).

### 2. One shift per day, anchored on its start; every hour weighs the same

A working-day shift runs 18:00 → 09:00 (15h); a weekend/holiday shift runs 09:00 → 09:00 (24h).
The shift belongs to the day it starts. This matches how the sheet is actually filled: the person in
18:00–23:00 of day D is the same in 00:00–08:00 of D+1. Night, weekend and holiday hours count the
same — balancing is on raw hours.

Splitting a shift is rare and only done by hand, so a shift is stored as segments, but the
scheduler always assigns whole shifts.

**Don't "fix" by:** weighting night/holiday hours, or making the scheduler split shifts to improve
the balance.

### 3. Auth is one token per dev plus a team password

There are no accounts, emails or OAuth. Each dev has a personal token, used by the web app (saved
in the browser once) and by the MCP server (sent by Claude Code). The token identifies the dev, so
it is both authentication and identity. A shared **team password** guards admin actions only:
adding/removing devs and issuing/resetting tokens. Tokens and the team password are stored hashed
and shown once.

Considered: Cloudflare Zero Trust in front of the app — dropped, since it does not tell the app
*which* dev is calling and complicates MCP access.

**Don't "fix" by:** adding a login provider, or storing tokens in plain text "to show them again".

### 4. Excel is filled by a generated Office Script

The sheet belongs to the manager; the team cannot replace it, only fill its Banking cells. Coruja
generates an Office Script (Excel → Automate → New script) that locates each day by its date header
and the "Banking" sub-header and writes one name per hour. Locating by labels, not positions, keeps
it working if the manager changes the layout. Fallback: a grid to paste with *Paste Special → Skip
blanks*.

Considered: Microsoft Graph writing directly to the file — needs an Azure app with admin consent;
VBA — desktop only and needs a macro-enabled file.

**Don't "fix" by:** hard-coding column indexes in the script, or overwriting non-Banking cells.

### 5. Preferences are recurring profile rules; month exceptions are calendar edits

Devs set rules once in their profile (per weekday and per day of month) and do not fill anything
per month. A one-off absence is handled by editing that month's calendar. Changing the profile
while a month is open does not touch that month: it would silently undo other devs' confirmations.

**Don't "fix" by:** re-running the scheduler on the open month when a profile changes, or adding
one-off dates to the profile.

### 6. Scheduler: "can't" is hard, everything else is ordered goals

Hard constraint: never assign a dev to a day they `cant`. If nobody is available, leave the day
unassigned and flag it. Goals, from most to least important:

1. balance hours across devs, including the balance carried over from previous months;
2. spread weekend/holiday shifts across devs;
3. honor `good`/`prefer`, stay away from `avoid`;
4. avoid back-to-back shifts for the same dev (allowed when needed).

"One dev per shift" is not absolute either (#2), but the scheduler does not optimize for splits.

**Don't "fix" by:** turning back-to-back avoidance into a hard rule, or assigning a `cant` day to
fill a gap.

### 7. Months open on the 20th with a suggestion and close manually

A cron opens the next month on the 20th and generates the suggestion right away — confirming makes
no sense with nothing on the calendar. Each dev confirms or edits; an edit resets the confirmation
of every dev whose shifts changed. When everyone has confirmed, whoever is last runs the export.
The month is closed manually by whoever exported; there is no automatic deadline. Anyone can edit
and close (no admin role for this). Shift swaps after the export live only in the Excel sheet.

**Don't "fix" by:** auto-closing at a deadline, or syncing swaps back from the sheet.

### 8. Everything runs in one Cloudflare Worker with D1

The user's personal domain is on Cloudflare. One Worker serves the API (Hono), the static Svelte
app, the cron and the MCP endpoint; data is in D1. Free tier covers the scale (one team, ~30 shifts
a month).

Considered: Vercel (Hobby plan is for non-commercial use, and this is a work tool; needs an
external database) and Railway (no real free tier, ~$5/month, but a plain server with no runtime
limits — the fallback if the app ever outgrows Workers).

Known limits: the free plan allows ~10ms of **CPU** per request (I/O wait does not count), so the
scheduler must stay lean or the $5 plan is needed; no native binaries. Hono, Drizzle and a pure
scheduler keep a move to Node/Bun cheap.

**Don't "fix" by:** splitting into Pages + separate Worker, or adding a Node server/Postgres.

### 9. Manager targets and "compensação" are out of scope

The sheet's summary has 80h/34h targets per group and a "compensação" column set by the manager.
Coruja only balances raw hours (with carry-over). Targets may come later; compensação is the
manager's call and stays in the sheet.

**Don't "fix" by:** computing "Fora a média" or importing compensação into the balance.

### 10. Microsoft integrations without admin consent

The company runs Microsoft 365 and the user wants nothing that needs Teams/Azure admin approval:

- **Excel:** Office Script (#4).
- **Outlook:** a per-dev `.ics` feed, added via "Add calendar → Subscribe from web".
- **Teams (pending confirmation):** channel notifications through a Workflows webhook ("Post to a
  channel when a webhook request is received"), created by any channel member. One-way only, and
  messages name devs in plain text (no @mentions, which would need emails).
- **Claude Code:** a remote MCP server in the Worker, authenticated with the dev token (#3).

**Don't "fix" by:** using Microsoft Graph or a Teams bot registration.

### 11. Svelte SPA with Hono as the only API

The front is plain Svelte 5 + Vite, built as a SPA and served as Worker static assets. Hono is the
single API, used by the web app and by the MCP server alike.

Considered: SvelteKit — it would take over routing and server endpoints, leaving Hono with little
to do, and its Cloudflare adapter makes the cron and the MCP endpoint awkward. React — the previous
choice; the user preferred Svelte. Elysia instead of Hono — its edge is on Bun; on Workers it runs
through a newer adapter, while Hono is Workers-first and gives the same typed client (#12).

**Don't "fix" by:** adding SvelteKit for routing, or adding server endpoints outside Hono.

### 12. The web app is typed from the API (Hono RPC)

The Worker exports `AppType` (the type of the chained Hono app) and the web app builds its client
with `hc<AppType>` in `src/web/api.ts`. Request and response types are never declared on the web
side, so changing an endpoint breaks the web type check instead of failing at runtime.

Two consequences that look odd:

- Routes are **chained** on the app or mounted with `.route()`; a route added as a separate
  statement works but is missing from `AppType`.
- Bindings are typed in `src/worker/bindings.ts` with module imports from
  `@cloudflare/workers-types`, not with the generated global `Env`: the web project type-checks the
  Worker files reachable from `AppType`, and the global Workers types clash with the DOM types.
  The cost is keeping `bindings.ts` in sync with `wrangler.jsonc` by hand.

**Don't "fix" by:** adding a `src/shared/types.ts` with payload types, calling `fetch('/api/...')`
directly, or switching `Bindings` to the global `Env`.

### 13. Drizzle for D1

Around eight related tables (devs, tokens, profile rules, months, shifts, segments, confirmations,
balances). Drizzle gives typed queries, generates the SQL migrations that wrangler applies, and a
move to SQLite/Postgres elsewhere only changes the driver. The user already uses it in another
project.

**Don't "fix" by:** hand-writing migrations, or raw `env.DB.prepare(...)` queries in handlers.

### 14. Holidays are São Paulo city's, computed in code and overridable

Every holiday valid in the city of São Paulo is a 24h day: national (incl. Good Friday, Nov 20),
state (Jul 9) and city (Jan 25, Corpus Christi). Carnaval is an optional day off, not a holiday.
Dates are computed in code, movable ones from Easter, so there is no external API to fail. Any user
can flip a day between 15h and 24h; that override belongs to the month, not to the holiday list.

**Don't "fix" by:** fetching holidays from an API, or adding Carnaval as a holiday (the team flips
it by hand when needed).

### 15. Hours are counted by calendar hour

A shift belongs to the day it starts (#2), but its **hours** count in the month they fall in: the
Nov 30 shift gives 6h to November and 9h to December. This matches the sheet's HORAS column, so
the app's numbers are the ones the manager sees, and the CSV import uses the same rule.

**Don't "fix" by:** counting the whole shift in the month it starts.

### 16. The starting balance comes from the November 2026 CSV

The first balance is imported from the November 2026 sheet export (the one this project was
planned from): Banking column, hours counted per cell, nicknames as in the sheet. The month was
still in progress when it was exported, so it reflects the planned roster, not hours actually
worked; that is accepted. Earlier months are not imported.

**Don't "fix" by:** importing the summary table's HORAS/compensação columns instead of counting the
grid.

### 17. Rolling release from master; migrations stay backward compatible

Every merge to `master` goes to production (Workers Builds deploys on push). No SemVer and no
release branches: it is a single web deployment, nobody installs or picks a version, and Cloudflare
keeps previous Worker versions, so `wrangler rollback` undoes a bad deploy in seconds. The change
log is `git log`: squash merges with Conventional Commit titles give one line per PR.

Rollback only reverts **code**, not D1. So migrations are applied **before** the deploy and must
work with the previous code too (expand/contract: add the new column in one deploy, drop the old
one in a later deploy).

Tags are milestones only, with a GitHub Release whose notes are generated from PR titles — the
first is `v0.1.0` when the MVP ships and the repo goes public.

**Don't "fix" by:** adding a release branch or version bumps per change, or shipping a migration
that drops/renames something the current code still reads.
