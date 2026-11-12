# Architecture

How Coruja is put together and what must stay true. Not a symbol list — for "where is X" see
[features-index.md](features-index.md).

**Status:** the shell (Worker with `/api/health`, placeholder Svelte root calling it through the
typed client), the **database schema**, and the pure **shift rules** (holidays, day kinds, hours by
calendar month, segment validation) exist, plus the **sheet reader** (Banking roster out of the
sheet exported as CSV). No API, scheduler or screens yet.

## Deploy shape

One Cloudflare Worker serves everything:

- `/api/*` → Hono app in `src/worker/` (`run_worker_first` in `wrangler.jsonc`).
- everything else → static Svelte build from `src/web/`, SPA fallback to `index.html`.
- D1 database bound as `DB`, accessed through Drizzle (`src/worker/db/`); SQL migrations generated
  by drizzle-kit into `migrations/` and applied by wrangler.
- The web app imports only the **type** `AppType` from the Worker and builds a typed client from it
  (`src/web/api.ts`). No runtime code crosses from `src/worker/` to `src/web/`.
- Planned: a Cron Trigger (opens the next month on the 20th) and a remote MCP endpoint in the same
  Worker.

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
      │  └─ dev edits a shift ──────────► every dev whose shifts changed goes back to pending
      ▼
all devs confirmed ──► "ready": anyone generates the Office Script and runs it in the sheet
      │
      ▼
closed (manually, by whoever exported) ── still editable to record swaps (no re-export)
```

There is no automatic deadline: the month closes when someone closes it. A month with an
unassigned day never becomes ready. Every change to a shift, in any state, goes to the change log
([decisions.md #21](decisions.md#21-every-roster-change-is-logged)).

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

### Hour balance

Each month's hours per dev are kept, and the difference to each dev's **expected share** (by
participation weight) **carries over** to the next suggestion (who took more than their share this
month gets fewer next). A new dev starts at the team's average balance; a dev who leaves is
deactivated, never deleted. The starting balance is imported
once from the November 2026 sheet export (CSV, Windows-1252), Banking column only
([decisions.md #16](decisions.md#16-the-starting-balance-comes-from-the-november-2026-csv)). The manager's 80h/34h targets and
"compensação" are **not** modeled ([decisions.md #9](decisions.md#9-manager-targets-and-compensacao-are-out-of-scope)).

## Tables

Defined in `src/worker/db/schema.ts` (first migration: `migrations/0000_init.sql`).

| Table | Holds |
|---|---|
| `devs` | nickname, participation weight, active flag, token hash. Never deleted |
| `preference_rules` | profile rules: (`weekday` 0–6 \| `month_day` 1–31) × (`good` \| `avoid` \| `cant`) |
| `absences` | planned absences, inclusive date ranges |
| `months` | `YYYY-MM`, `open`/`closed`, who closed |
| `month_participants` | devs of a month with the weight frozen at opening |
| `days` | one per date = that day's shift; `workday` (15h) / `day_off` (24h), holiday name |
| `shift_segments` | who covers which hours of a shift (offsets from the shift start) |
| `confirmations` | per month and dev; composite FK to `month_participants` |
| `balance_adjustments` | hours added to a balance outside shifts (`joined`, `import`) |
| `change_log` | every roster change, `before`/`after` as JSON |

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
- **The sheet's encoding is Windows-1252** when exported to CSV. Decode the bytes before
  `readSheetRoster` (in the browser, `new TextDecoder('windows-1252')`), or nicknames like "Ícaro"
  arrive broken and match no dev.
