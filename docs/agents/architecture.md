# Architecture

How Coruja is put together and what must stay true. Not a symbol list — for "where is X" see
[features-index.md](features-index.md).

**Status:** the **database schema**, the pure **shift rules** (holidays, day kinds, hours by
calendar month, segment validation), the **scheduler**, the **sheet reader and writer** (Banking
roster out of the CSV export; Office Script and paste grid back into the sheet), the **API** (auth,
devs, profiles, months: open, edit, confirm, export, import, sheet diff and sync) and the
**screens** (token entry, month, profile, admin) and the **cron** that opens months exist.

## Deploy shape

One Cloudflare Worker serves everything:

- `/api/*` → Hono app in `src/worker/` (`run_worker_first` in `wrangler.jsonc`).
- everything else → static Svelte build from `src/web/`, SPA fallback to `index.html`.
- D1 database bound as `DB`, accessed through Drizzle (`src/worker/db/`); SQL migrations generated
  by drizzle-kit into `migrations/` and applied by wrangler.
- The web app imports only the **type** `AppType` from the Worker and builds a typed client from it
  (`src/web/api.ts`). No runtime code crosses from `src/worker/` to `src/web/`.
- A Cron Trigger runs the same Worker daily at 03:00 UTC (midnight in São Paulo) and opens the next
  month on the 20th (`src/worker/cron.ts`).
- Planned: a remote MCP endpoint in the same Worker.

## Domain

### Shifts

The roster covers **only the Banking column** of the manager's sheet. One shift per calendar day,
anchored on the day it **starts**:

| Day kind | Starts | Ends | Hours |
|---|---|---|---|
| Working day | 18:00 | 09:00 next day | 15 |
| Weekend or holiday | 09:00 | 09:00 next day | 24 |

Every hour weighs the same (night, weekend and holiday included). Hours are what gets balanced.

A shift normally has one dev. Splitting it between two devs by hour range is **rare and manual
only** — the scheduler never proposes it, but the model must allow it, so a shift is stored as one
or more segments (`dev`, `from`, `to`).

**Hours are counted by calendar hour** (decisions #15): a shift that crosses into the next month
splits its hours between both months, exactly like the sheet's HORAS column. Example: the Nov 30
shift (18:00 → Dec 1 09:00) gives 6h to November and 9h to December.

### Holidays

When a month opens, every holiday valid in the **city of São Paulo** is a 24h day: national
holidays (incl. Good Friday and Nov 20), the state holiday (Jul 9) and the city's (Jan 25, Corpus
Christi). Carnaval is an optional day off, not a holiday. Dates are computed in code (movable ones
from Easter), no external API. Any user can flip any day between 15h and 24h on the month's
calendar ([decisions.md #14](decisions.md#14-holidays-are-sao-paulo-citys-computed-in-code-and-overridable)).

### Profiles

Each dev has a profile with:

- a **participation weight** (100% by default; the share of hours they should take,
  [decisions.md #18](decisions.md#18-each-dev-has-a-participation-weight));
- recurring rules **per weekday** and **per day of month** (e.g. "the 5th"), all on one scale:
  `good` / `avoid` / `cant`, no rule = neutral;
- **planned absences**: date ranges known in advance (vacation, a trip), treated as `cant` when a
  month opens.

Something that comes up after a month opened is an edit on that month's calendar. A profile change **never** rewrites a month that is already open — it applies to the
next suggestion ([decisions.md #5](decisions.md#5-preferences-are-profile-rules-and-planned-absences-open-month-exceptions-are-calendar-edits)).

### Month lifecycle

```
open (20th of previous month, cron) ──► suggestion generated from profiles + hour balance
      │
      ▼
reviewing ── dev confirms ──────────────► confirmed (per dev)
      │  ├─ dev edits a shift ──────────► every dev whose shifts changed goes back to pending
      │  └─ dev generates it again ─────► new suggestion from today's profiles; everyone pending
      ▼
all devs confirmed ──► "ready": anyone exports (Office Script or paste grid) into the sheet
      │                  (pending confirmations allowed, with a warning; empty days refused)
      ▼
exported (when, by whom) ── edits record swaps, no confirmations; each one counts as a
                            "change after the export" until someone exports again
```

There is no deadline and no closing
([decisions.md #26](decisions.md#26-months-are-never-closed-exports-are-recorded)). A month with an
unassigned day never becomes ready and cannot be exported. Every change to a shift, in any state, goes to the change log
([decisions.md #21](decisions.md#21-every-roster-change-is-logged)).

### Scheduler

`suggestRoster` (`src/schedule/scheduler.ts`) takes the month's calendar, the previous month's last
day (its shift runs into day 1) and each participant's weight, carried balance, rules and absences,
and returns one dev per day, whole shift. `cant` (and absences) are never assigned; a day nobody
can take comes back unassigned. Everything else is one cost it minimizes
([decisions.md #24](decisions.md#24-the-scheduler-minimizes-one-cost-conflicting-rules-resolve-to-the-most-restrictive)):
hours against the weighted share, weekend/holiday spread, `avoid`/`good`, back-to-back. A weight of
0 means never scheduled. It does not produce split shifts. A 30-day month with ~8 devs runs in a
few milliseconds.

### Reading the sheet (CSV)

`readSheetRoster` (`src/sheet/roster.ts`) turns the sheet exported as CSV into the month's days,
shift segments by nickname, the hours of day 1 that belong to the previous month's last shift, and
per-day problems. It feeds both the starting-balance import (#16) and the swap sync (#23). It finds
columns by date and by the "Banking" label, accepts month-first or day-first dates and `,` or `;`.

- **Day kind comes from the sheet:** a day whose office hours (09:00–18:00) say "Expediente" is a
  workday, any other is a 24h day. This keeps a day someone flipped by hand as the sheet has it.
- **The last shift is cut off:** its hours on day 1 of the next month are not in the file, so the
  whole shift goes to whoever holds its last visible hour.
- **Problems, not guesses:** a shift with some hours named and others empty (`partly_assigned`) or a
  workday with names during office hours (`names_in_office_hours`) is reported; callers refuse to
  write a month with problems. A shift with no names at all is simply unassigned.

Checked against the November 2026 export: every dev's hours match the sheet's HORAS column.

### Writing to the sheet (export)

`src/sheet/export.ts`: `bankingCells` turns the month's shifts (and the previous month's last one,
which fills the morning of day 1) into the Banking cell of every calendar hour — a nickname, `''`
for office hours of a workday (clears a stale name) or `null` (leave it). `officeScript` embeds
those cells in an Office Script that finds the date row (Excel serial dates, or text day-first or
month-first), the "Banking" label under each date and the hour rows, refuses a tab that does not
have every date of the month, never writes over "Expediente" and logs what it changed.
`pasteGrid` is the fallback: the sheet's layout with only the Banking cells filled, to paste with
*Skip blanks*. The tests run the generated script against an in-memory sheet and read the result
back with `readSheetRoster`.

### Hour balance

Each month's hours per dev are kept, and the difference to each dev's **expected share** (by
participation weight) **carries over** to the next suggestion (who took more than their share this
month gets fewer next). A new dev starts at the team's average balance; a dev who leaves is
deactivated, never deleted. The starting balance is imported
once from the November 2026 sheet export (CSV, Windows-1252), Banking column only
([decisions.md #16](decisions.md#16-the-starting-balance-comes-from-the-november-2026-csv)). The manager's 80h/34h targets and
"compensação" are **not** modeled ([decisions.md #9](decisions.md#9-manager-targets-and-compensacao-are-out-of-scope)).

The expected share is of the hours **actually assigned** in the month, so a month's balances add
up to zero. A dev assigned by an edit who is not a participant of the month (joined after it opened,
weight 0) has an expected share of zero
([decisions.md #25](decisions.md#25-balances-are-shares-of-assigned-hours-outsiders-expect-zero)).
`monthHoursByDev` (`src/schedule/balance.ts`) does one month; `loadBalances`
(`src/worker/store/balances.ts`) adds up every month and the adjustments.

## API

Hono, under `/api`, in `src/worker/`: `routes/` (HTTP: auth middleware, validation, status codes)
call `store/` (reads and writes in D1, the domain rules in `src/schedule/` and `src/sheet/`).

- **Auth** (decisions #3, `src/worker/auth.ts`): `Authorization: Bearer <token>` identifies the dev
  (`context.var.dev`); a deactivated dev's token stops working. Admin routes take the team password
  in `X-Team-Password` instead, without a token (that is how the first dev is created). Tokens are
  `coruja_` + 32 random bytes, stored as SHA-256 hex; the team password is compared by digest.
- **Admin routes** (team password): add a dev (returns the token, once), rename or (de)activate,
  replace a token, edit someone else's profile, import a month from the sheet.
- **Errors**: `{ error: code, ...details }` with a stable English code (`month_exported`,
  `invalid_segments`, `unknown_nicknames`...). Store code throws `ApiError`; `app.onError` answers
  it. Invalid input is 400 `invalid_request` with zod's `issues`.
- **Writes are atomic**: one D1 batch per operation (`runBatch`), multi-row inserts chunked under
  D1's 100-parameter limit (`insertRows`).
- **Opening a month** runs the scheduler inside the request (a few ms of CPU for one team).
  Participants = active devs with weight above 0, weights frozen. A month can only be added after
  the latest one. The **cron** runs daily and opens every month after the newest up to the default
  one (`monthsDueToOpen`): the next month from the 20th on, São Paulo date, so a failed run is made
  up the next day. It opens nothing while there is no month yet: the first month comes from the
  import or is opened by hand. Any dev can also open a month by hand.
- **Editing days** (`applyDayChanges`) is the single write path for calendar edits and sheet syncs:
  it validates segments (`findSegmentProblem`), skips days left as they were, logs each changed day,
  and, before the month's first export, removes the confirmations of devs whose hours changed. A new day kind
  changes the hours of everyone on that day.
- **Sheet**: the web app decodes the CSV (Windows-1252) and sends it as text in JSON. Import and
  diff refuse unreadable files, sheet problems and nicknames that are not devs (matched ignoring
  case). The diff's `after` is exactly what `POST /months/:month/changes` takes.

## Web app

A Svelte 5 SPA in `src/web/`, served by the same Worker as static assets
([decisions.md #27](decisions.md#27-screens-hash-router-shadcn-svelte-dark-mode-by-redefining-the-palette)).
Hash routes: `#/entrar`, `#/mes/YYYY-MM` (`#/mes` = the default month: the current one, the next
from the 20th on), `#/perfil`, `#/admin`, `#/admin/dev/:id`. Each screen loads what it shows and
reloads after every action; there is no client cache.

- **Sign-in:** the dev pastes their token once; it is checked with `GET /me` and kept in
  `localStorage`. A token the API refuses signs out. Admin screens ask for the team password, check
  it with `GET /team/check` and keep it for the tab; they work without a dev token (the first devs
  are created there).
- **Month:** arrows from the first month in Coruja to the one after the newest. A month not opened
  yet shows when it opens; if its 20th has passed and it is still
  closed (the cron failed), a button opens it. With no month at all it points to the sheet import
  (the first month comes from the sheet, decisions #16), opening with a suggestion only as a small link.
  "Hoje" shows today's on-call, from today's month in São Paulo time.
- **Export:** the Office Script goes to the clipboard (with a button if the browser refuses); the
  paste grid becomes an `.xlsx` built in the browser (`xlsx.ts`, `fflate`).
- **Sheet:** the admin screen decodes the CSV from Windows-1252, then imports it or shows the diff
  and applies it.

## Tables

Defined in `src/worker/db/schema.ts` (first migration: `migrations/0000_init.sql`).

| Table | Holds |
|---|---|
| `devs` | nickname, participation weight, active flag, token hash. Never deleted |
| `preference_rules` | profile rules: (`weekday` 0–6 \| `month_day` 1–31) × (`good` \| `avoid` \| `cant`) |
| `absences` | planned absences, inclusive date ranges; never overlapping for one dev (`addAbsence` merges) |
| `months` | `YYYY-MM`, opened at, last export (when, by whom) |
| `month_participants` | devs of a month with the weight frozen at opening |
| `days` | one per date = that day's shift; `workday` (15h) / `day_off` (24h), holiday name |
| `shift_segments` | who covers which hours of a shift (offsets from the shift start) |
| `confirmations` | per month and dev; composite FK to `month_participants` |
| `balance_adjustments` | hours added to a balance outside shifts (`joined`, `import`) |
| `change_log` | every roster change (and generate, regenerate, confirm, export, import), `before`/`after` as JSON |

**Not stored, always computed:** hours per dev per month (from segments, by calendar hour),
balances (`Σ (actual − expected share) + adjustments`), "ready for export" (all participants
confirmed and no day without segments), holidays (computed when a month opens, then stored as the
day's kind).

The database enforces ranges, enums and "only participants confirm" with CHECKs and FKs. What it
cannot express is enforced in code: segments of a day cover the whole shift with no gaps or
overlaps (`findSegmentProblem` in `src/schedule/shifts.ts` — every write path calls it).

## Invariants

- The scheduler never assigns a dev to a day they marked `cant`. If a day has nobody available,
  the suggestion leaves it **unassigned and flagged**, it does not break the rule.
- Edits after the suggestion only reset the confirmations of devs whose shifts changed.
- The Office Script only writes Banking cells; it finds them by the date header and the "Banking"
  label, never by column index.

## What bites

- **Month boundary.** The last shift of a month runs until 09:00 on day 1 of the next month. In the
  November sheet, 00:00–08:00 of Nov 1 belongs to the October 31 shift. The export must fill those
  hours from the previous month's roster, and the hour count splits the shift between both months.
- **Holidays turn a 15h shift into a 24h one.** The sheet treated Nov 2 and Nov 20 as weekend days.
  The day kind matters for both the hours and the export.
- **Scheduler CPU time.** The search recomputes the whole cost for each tried move. Fine for a team
  of ~10, but Workers on the free plan cap CPU at 10 ms per request: measure before growing the
  team or the moves much.
- **The sheet's encoding is Windows-1252** when exported to CSV. Decode the bytes before
  `readSheetRoster` (in the browser, `new TextDecoder('windows-1252')`), or nicknames like "Órion"
  arrive broken and match no dev.
