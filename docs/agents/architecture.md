# Architecture

How Coruja is put together and what must stay true. Not a symbol list — for "where is X" see
[features-index.md](features-index.md).

**Status:** only the shell exists (Worker with `/api/health`, placeholder Svelte root calling it
through the typed client, Drizzle wired to an empty schema). The domain below is the agreed design;
the tables are not written yet.

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

### Profiles (recurring preferences)

Each dev has a profile with recurring rules, valid for every month:

- per weekday: `good` / `neutral` / `avoid` / `cant`
- per day of month (e.g. "the 5th"): `prefer` / `cant`

One-off exceptions (vacation, a trip) are **not** profile rules: they are edits on that month's
calendar. A profile change **never** rewrites a month that is already open — it applies to the
next suggestion ([decisions.md #5](decisions.md#5-preferences-are-recurring-profile-rules-month-exceptions-are-calendar-edits)).

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
closed (manually, by whoever exported)
```

There is no automatic deadline: the month closes when someone closes it.

### Hour balance

Each month's hours per dev are kept, and the difference to the team average **carries over** to
the next suggestion (who took more this month gets fewer next). The starting balance is imported
once from the November 2026 sheet export (CSV, Windows-1252), Banking column only
([decisions.md #16](decisions.md#16-the-starting-balance-comes-from-the-november-2026-csv)). The manager's 80h/34h targets and
"compensação" are **not** modeled ([decisions.md #9](decisions.md#9-manager-targets-and-compensacao-are-out-of-scope)).

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
- **The sheet's encoding is Windows-1252** when exported to CSV.
