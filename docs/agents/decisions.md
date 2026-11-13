# Decisions

Choices that look wrong (or arbitrary) but are intentional. Read before "fixing" one of them.

## Index

Entries are **self-contained**: read only the one you were pointed at. Cite by **anchor**, never by
line number. A new entry takes the **next number** (highest today is **#30**) plus one line here;
never renumber.

- [**#1** — Only the dev team's Banking column; devs are nicknames](#1-only-the-dev-teams-banking-column-devs-are-nicknames)
- [**#2** — One shift per day, anchored on its start; every hour weighs the same](#2-one-shift-per-day-anchored-on-its-start-every-hour-weighs-the-same)
- [**#3** — Auth is one token per dev plus a team password](#3-auth-is-one-token-per-dev-plus-a-team-password)
- [**#4** — Excel is filled by a generated Office Script](#4-excel-is-filled-by-a-generated-office-script)
- [**#5** — Preferences are profile rules and planned absences; open-month exceptions are calendar edits](#5-preferences-are-profile-rules-and-planned-absences-open-month-exceptions-are-calendar-edits)
- [**#6** — Scheduler: "can't" is hard, everything else is ordered goals](#6-scheduler-cant-is-hard-everything-else-is-ordered-goals)
- [**#7** — Months open by hand, with a suggestion](#7-months-open-by-hand-with-a-suggestion)
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
- [**#18** — Each dev has a participation weight](#18-each-dev-has-a-participation-weight)
- [**#19** — New devs start at the team's average balance; leaving devs are deactivated](#19-new-devs-start-at-the-teams-average-balance-leaving-devs-are-deactivated)
- [**#20** — Closed months stay editable to record swaps](#20-closed-months-stay-editable-to-record-swaps)
- [**#21** — Every roster change is logged](#21-every-roster-change-is-logged)
- [**#22** — A month with an unassigned day is never "ready"](#22-a-month-with-an-unassigned-day-is-never-ready)
- [**#23** — Swaps come back from the sheet as a CSV diff (and through MCP)](#23-swaps-come-back-from-the-sheet-as-a-csv-diff-and-through-mcp)
- [**#24** — The scheduler minimizes one cost; conflicting rules resolve to the most restrictive](#24-the-scheduler-minimizes-one-cost-conflicting-rules-resolve-to-the-most-restrictive)
- [**#25** — Balances are shares of assigned hours; outsiders expect zero](#25-balances-are-shares-of-assigned-hours-outsiders-expect-zero)
- [**#26** — Months are never closed: exports are recorded](#26-months-are-never-closed-exports-are-recorded)
- [**#27** — Screens: hash router, shadcn-svelte, dark mode by redefining the palette](#27-screens-hash-router-shadcn-svelte-dark-mode-by-redefining-the-palette)
- [**#28** — Any dev can generate an open month's roster again, from scratch](#28-any-dev-can-generate-an-open-months-roster-again-from-scratch)
- [**#29** — The Worker runs next to D1, not next to the user](#29-the-worker-runs-next-to-d1-not-next-to-the-user)
- [**#30** — Screens hide the round trip: one wave, the last answer in memory, skeletons](#30-screens-hide-the-round-trip-one-wave-the-last-answer-in-memory-skeletons)
- [**#31** — Closing a month undoes its opening](#31-closing-a-month-undoes-its-opening)

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
adding/removing devs and issuing/resetting tokens. Dev tokens are stored hashed and shown once.
The team password is a **Worker secret** (`TEAM_PASSWORD`), not a table: changing it is rare and
done with `wrangler secret put` by the repo owner.

Considered: Cloudflare Zero Trust in front of the app — dropped, since it does not tell the app
*which* dev is calling and complicates MCP access.

**Don't "fix" by:** adding a login provider, storing tokens in plain text "to show them again", or
moving the team password into the database.

### 4. Excel is filled by a generated Office Script

The sheet belongs to the manager; the team cannot replace it, only fill its Banking cells. Coruja
generates an Office Script (Excel → Automate → New script) that locates each day by its date header
and the "Banking" sub-header and writes one name per hour. Locating by labels, not positions, keeps
it working if the manager changes the layout. Fallback: a grid to paste with *Paste Special → Skip
blanks*.

Considered: Microsoft Graph writing directly to the file — needs an Azure app with admin consent;
VBA — desktop only and needs a macro-enabled file.

**Don't "fix" by:** hard-coding column indexes in the script, or overwriting non-Banking cells.

### 5. Preferences are profile rules and planned absences; open-month exceptions are calendar edits

Devs set rules once in their profile and do not fill anything per month. Two kinds of rule, one
scale:

- **per weekday**, each `good` / `avoid` / `cant` (no rule = neutral). `avoid` exists so people
  do not mark `cant` for days they merely dislike, which would make months impossible to fill.
- **days they can't take** (absences): specific dates, marked on a month calendar by tapping a day
  or dragging across several (an appointment on Dec 10, a vacation). Stored as merged periods;
  the scheduler treats them as `cant`. Specific dates are only `cant`: "prefer"/"avoid" on a single
  date was judged not worth the extra state.

Day-of-month rules ("every 5th") existed at first and were replaced by specific dates (2026-11):
a commitment on a date is almost always for one month, not every month.

Something that comes up after the month opened is an edit on that month's calendar. Changing the
profile (rules, absences or weight) while a month is open does not touch that month: it would
silently undo other devs' confirmations. The profile calendar warns about it on a month that already
has a roster (the change only counts if the month is regenerated) instead of blocking it.

Considered and left out: holidays as a rule category, "1st weekend of the month"/alternate weeks,
caps like "at most 2 weekends a month" (participation weight and weekend spread cover it).

**Don't "fix" by:** re-running the scheduler on the open month when a profile changes, or bringing
back day-of-month rules.

### 6. Scheduler: "can't" is hard, everything else is ordered goals

Hard constraint: never assign a dev to a day they `cant`. If nobody is available, leave the day
unassigned and flag it. Goals, from most to least important:

1. balance hours across devs **in proportion to their participation weight** (#18), including the
   balance carried over from previous months;
2. spread weekend/holiday shifts across devs;
3. take `good` days, stay away from `avoid` days;
4. avoid back-to-back shifts for the same dev (allowed when needed).

"One dev per shift" is not absolute either (#2), but the scheduler does not optimize for splits.

**Don't "fix" by:** turning back-to-back avoidance into a hard rule, or assigning a `cant` day to
fill a gap.

### 7. Months open by hand, with a suggestion

Any dev opens the next month **whenever the team wants**, and the suggestion is generated right
away — confirming makes no sense with nothing on the calendar. The first design had a cron open it
on the 20th; it was dropped: the team decides when, and an opening done too early can be undone
(#31). **Every participant of the month confirms**, including a
dev who got no shift. An edit resets the confirmation of every dev whose shifts changed. When
everyone has confirmed, whoever is last runs the export.

There is no deadline and no closing (#26): anyone exports (no admin role for this), and
**exporting does not require every confirmation**: if some are pending, the user sees who has not
confirmed and exports anyway if they want. Swaps after the export are recorded on the same month
(#20).

**Don't "fix" by:** adding a deadline, blocking the export on pending confirmations, or bringing back
an automatic opening.

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
planned from) as a **full month, already exported** (the sheet has it): days, segments (Banking column, one cell = one hour,
nicknames as in the sheet) and participants with their weights. The balance then comes out of the
same formula as every other month, and the app knows who holds the Nov 30 shift that runs into
December. The 00:00–08:00 hours of Nov 1 belong to the Oct 31 shift, which is not in the app: they
enter as `balance_adjustments` rows with reason `import`, one per participant (see #25).

Order matters: create the devs and set their weights **before** importing, because the month's
participant weights are stored at import time.

The month was still in progress when it was exported, so it reflects the planned roster, not hours
actually worked; that is accepted (later swaps can be synced, #23). Earlier months are not
imported, and neither are later ones: once the app has any month, the import is refused
(`not_first_month`), because an imported month skips the suggestion and the confirmations. So the
import is offered only on the empty month screen, and any dev may run it (a dev token, not the team
password): it is the same power as opening the first month.

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

### 18. Each dev has a participation weight

Some devs are on call less than others (in November 2026 three devs had a much lower target). Each
dev has a **participation weight** in the profile, 100% by default. The scheduler balances hours
against each dev's **expected share** — `weight / sum of active weights` of the month's hours — not
against an equal split, and the carried-over balance is `actual − expected`. Anyone can change a
weight (same trust model as the rest of the app).

This is not the manager's 80h/34h target (#9): it only sets the proportion of the split.

**Don't "fix" by:** balancing raw hours equally, or modeling fixed hour targets instead of weights.

### 19. New devs start at the team's average balance; leaving devs are deactivated

A dev who joins starts with the **average balance** of the active team, not zero — at zero they
would be flooded with shifts to "catch up". A dev who leaves is **deactivated**, never deleted:
their past shifts and the change log keep pointing at them, and they stop being scheduled.

**Don't "fix" by:** starting new devs at zero, or deleting a dev row.

### 20. Closed months stay editable to record swaps

Swaps keep happening in the Excel sheet after the export. If the app never learns about them, the
balance drifts from the real hours and the next suggestion is computed on wrong numbers. So an
exported month can still be edited to record what actually happened; those edits update the balance
and are logged (#21), but they do not reset confirmations. Each one counts as a change the sheet
may not have yet, until the next export (#26).

**Don't "fix" by:** locking exported months, or reopening the confirmation flow on a post-export
edit.

### 21. Every roster change is logged

Anyone can edit any shift, so "who took me off the 14th?" will come up. Every change to a shift
(assignment, split, day kind 15h↔24h, sync from the sheet) writes a log row: who, when, which day,
before → after. The log is shown on the month's calendar. Generating a suggestion is logged as one
entry, not one per shift.

**Don't "fix" by:** logging only manual edits, or storing the log as free text.

### 22. A month with an unassigned day is never "ready"

When nobody can take a day, the scheduler leaves it unassigned and flagged (#6). The month cannot
become ready and the Office Script is not generated until every day has someone; whoever takes the
day does it through a normal edit. The API refuses the export (`unassigned_days`) until then.

**Don't "fix" by:** letting the export run with empty Banking cells, or auto-assigning a `cant` day.

### 23. Swaps come back from the sheet as a CSV diff (and through MCP)

To record swaps made in the Excel sheet (#20), a user uploads the sheet exported as CSV. The app
reads the Banking column with the **same parser as the starting-balance import** (#16), compares it
with the roster of the sheet's own month (no month to pick) and shows **only the differences**
("day 14: Pedro → Luis"). Nothing is
applied until the user confirms; applied differences go to the change log (#21).

Everything ends in one API operation, "apply these differences to the month", which the MCP server
also exposes: a dev can tell Claude Code "I swapped the 14th with Pedro", or hand it the CSV.

Later, maybe: an Office Script that reads the sheet (the reverse of the export), once Office
Scripts availability is confirmed.

**Don't "fix" by:** applying an uploaded CSV without the diff confirmation, writing a second CSV
parser, or giving the MCP its own write path that bypasses the change log.

### 24. The scheduler minimizes one cost; conflicting rules resolve to the most restrictive

The goals of #6 are not applied one after another: each becomes a cost (squared hours away from the
weighted share, squared weekend/holiday shifts away from the share, a penalty per `avoid` day, a
bonus per `good` day, a penalty per back-to-back pair) and the suggestion is the roster with the
lowest total that a greedy first pass plus local search (move one day, swap two days) finds. The
order of #6 comes from the size of the costs: moving a 15h shift between two balanced devs costs
more than any single preference, so a preference only decides between rosters with about the same
hours. Strict priority would make preferences almost never matter, since nearly any change moves
hours a little. The search is deterministic, so the same input gives the same roster.

A date marked as one the dev can't take is `cant`, whatever the weekday rule says (the **more
restrictive** wins: `cant` > `avoid` > `good`).

**Don't "fix" by:** making a lower goal a strict tie-breaker of the one above, adding randomness to
the search, or letting a `good` rule override an `avoid`/`cant` on the same date.

### 25. Balances are shares of assigned hours; outsiders expect zero

A dev's expected hours in a month are their weight's share of the hours **actually assigned** that
month, not of every shift hour. A month's balances then always add up to zero: an unassigned day
(#22) does not put the whole team in debt.

Any dev can be put on a day by an edit, not only the month's participants (fixed when it opens).
That covers a dev who joined after the month opened, or one with weight 0 taking a swap. Their
expected share is zero, so all their hours that month become balance, and they are not asked to
confirm. The month view lists them apart, as `outsiders`.

The November import (#16) cannot store the Oct 31 shift, whose last 9 hours fall on Nov 1. Instead,
each participant gets an `import` adjustment of *their hours in it − their share of its hours*:
exactly what they would get if that shift were stored, so the balances still add up to zero.

**Don't "fix" by:** computing the share over every shift hour, refusing edits that assign a
non-participant, or adding the Oct 31 hours to only the dev who worked them.

### 26. Months are never closed: exports are recorded

The first design closed a month by hand once the sheet was filled. "Closed" changed nothing anyone
could see and only stopped the confirmations, so it was replaced by what it stood for: **the
export**. Exporting (Office Script or the paste grid, #4) records when and by whom; the month view
shows it, and counts the day changes logged after it, so "the sheet is out of date, export again"
is visible. Confirmations stop at the first export: after it, edits record swaps (#20). A month
imported from the sheet (#16) is born exported.

The calendar shows one month at a time, with arrows and the month in the URL. The default month is
the current one, and from the 20th on the next one, which is usually the month being confirmed then.

**Don't "fix" by:** bringing back a "closed" state, or resetting confirmations on an edit made
after the export.

### 27. Screens: hash router, shadcn-svelte, dark mode by redefining the palette

The screens were approved on a throwaway prototype (branch `prototype/screens`, deleted; its last commit was `444ac55`) before being built.

- **Router:** a hash router of a few lines (`src/web/router.svelte.ts`). Five routes do not need a
  library, and hash URLs need no server routes on the Worker.
- **Components:** Tailwind v4 plus shadcn-svelte, copied into `src/web/lib/components/ui/` (dialog,
  popover, range calendar, dropdown menu, tabs, toast). They bring focus handling and keyboard
  navigation; the month grid and everything else is plain Tailwind. The CLI's `init` hangs here, so
  `components.json`, `lib/utils.ts` and the CSS were set up by hand; `bunx shadcn-svelte@latest add
  <name>` works.
- **Dark mode:** instead of `dark:` variants on every class, the dark theme redefines the palette
  (`src/web/app.css`): grays become a dark-gray scale and each colour family is mirrored (50 ↔ 950)
  with less chroma, so `bg-sky-100` stays a soft colour in both themes. The shadcn tokens are built
  on that palette and flip with it. The theme follows the system unless picked (`mode-watcher`).
- **Session:** the dev token stays in `localStorage` (signed in until "sair"); the team password in
  `sessionStorage` (admin access ends with the tab).
- **Phones:** below `md` the month grid becomes a list of days and the nav a bottom tab bar; the
  day editor is a bottom sheet.

**Don't "fix" by:** adding `dark:` classes next to palette classes (they would undo the mirrored
palette), or adding a colour family without its dark scale in `app.css`.

### 28. Any dev can generate an open month's roster again, from scratch

The suggestion is made when the month opens (#7), so a profile changed after the 20th would only
count from the next month. Instead, any dev can **generate the roster again** while the month is
not exported: the scheduler runs with the profiles, absences, weights and active devs as they are
now (participants and frozen weights are replaced), keeping each day's kind (a bridge day someone
set stays). Every confirmation goes, and the log records who did it (`regenerate`).

- **From scratch, not around the edits:** days changed by hand are thrown away. The dialog says how
  many and by whom first (`editsAfterSuggestion` in the month view). Keeping them would need the
  scheduler to take fixed days, balance worse and be harder to explain.
- **Any dev, not admin only:** everyone has to confirm again anyway, and the log shows who did it.
- **Not after the export** (the sheet already has it: changes are swaps then) **nor when a later
  month exists** (its suggestion and balances read this month's hours).

**Don't "fix" by:** regenerating automatically when a profile changes (it would wipe confirmations
and edits nobody asked to lose), or keeping hand edits as fixed days without revisiting this entry.

### 29. The Worker runs next to D1, not next to the user

The team is in Brazil, but D1 has no South American location: the database's primary is in ENAM
(eastern North America) and read replicas have no South American region either. Run at the edge,
the Worker was in Rio and every query crossed to the US and back (~135 ms each), so a month view,
with several queries in sequence, took about a second. `placement.region` in `wrangler.jsonc`
(`aws:us-east-1`, Northern Virginia) runs `/api/*` next to the database instead: each request
makes one long hop and its queries cost a few milliseconds. Measured from São Paulo, a request with
one query went from ~200 ms to ~215 ms, and a request with no query from ~75 ms to ~210 ms; each
extra query in sequence now costs ~5 ms instead of ~135 ms. Static assets are still served from the edge.

- **A region, not Smart Placement:** Smart Placement only moves a Worker once it has enough
  traffic, which one small team may never give it.
- **Round trips between the web app and the API still cost a full hop each:** load in parallel
  (`Promise.all`) rather than in waves.

**Don't "fix" by:** removing the placement to make `/api/health` faster, or moving the database
without changing the region to match.

### 30. Screens hide the round trip: one wave, the last answer in memory, skeletons

With the Worker next to D1 (#29), every request from Brazil costs one trip to the US (~170 ms on
an open connection) however few queries it makes. The screens are built around that cost instead
of moving the data:

- **One wave per load.** The month page asks for the month list, devs, the month, its log and
  today's month together; a month that does not exist yet answers `month_not_found` and counts as
  "not opened", instead of checking the list first and asking in a second wave.
- **The last answer stays in memory** (`src/web/cache.svelte.ts`), per screen: a screen shown again
  appears at once and refreshes behind. In memory only, so a page reload starts fresh, and it is
  forgotten on sign-out and on admin lock. A screen with nothing remembered shows skeletons.
- **Profile rule buttons do not reload.** The click already shows the new state; saves go out one
  after the other (a later click must not be overwritten by an earlier answer) and only a failure
  reloads. Other actions reload after waiting for pending rule saves.

**Don't "fix" by:** keeping the cache in `localStorage` (another dev on the same browser, or a
stale roster after a day away, would show first), or reloading the profile after each rule click
(it brought the "half a second to register" back, and rapid clicks flickered).

### 31. Closing a month undoes its opening

With months opened by hand (#7), one can be opened too early or by mistake. **Closing** throws it
away completely — roster, participants, confirmations, day kinds and its change log — and it is "not
opened" again; opening it later makes a fresh suggestion. This is not the old "closed" state (#26):
nothing is kept.

- **Only before it starts, even after the export:** a started month is the roster people are on
  call by. An exported one can go: the sheet keeps what was written until someone exports again.
- **Only the newest month:** a later month's suggestion and balances read this one's hours.
- **The month's log goes too** (its rows reference the month); the Worker log records who closed it.
- **Any dev,** like opening and generating again (#28).

**Don't "fix" by:** keeping a "closed" flag on the row, or refusing it after the export.
