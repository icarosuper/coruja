# TODO — Coruja

**This file holds open work only.** A closed item is deleted from the body and gets one line in
"Closed so far". Git keeps the full text.

**Closed so far:** *(2026-11-12)* planning and repo skeleton (Worker + D1 + Svelte shell, docs);
holidays, month boundary, UI language, starting balance, Drizzle, Svelte and the typed client
decided (decisions #11–#16).

## Open questions (ask the user)

- **Teams Workflows:** does the "Post to a channel when a webhook request is received" template
  exist and work in the team channel without admin approval? If not, notifications are dropped.
- **Office Scripts:** is the manager's sheet on OneDrive/SharePoint, and is the Automate tab
  available? (Required by decisions #4.)
- **Domain:** which subdomain of the personal domain.

## Build order

1. **Domain model + schema** — devs, tokens, profile rules, months, days (15h/24h), shifts/segments,
   confirmations, balances. First migration.
2. **Holidays + hour counting** (pure + tests) — São Paulo holidays (#14), calendar-hour split (#15).
3. **CSV import** of the starting balance (#16).
4. **Scheduler** (`src/schedule/`, pure + tests) — hard rule, ordered goals (decisions #6). Validate
   against the November 2026 sheet.
5. **API** — auth (dev token, team password), profile, month view, confirm, edit, close.
6. **Screens** — decide with the user first: calendar of the month, profile, admin; router and
   component library. Nothing is coded before it is approved.
7. **Office Script export** (+ paste-special fallback grid).
8. **Cron** — open the next month on the 20th.
9. **Outlook `.ics` feed** per dev.
10. **MCP server** for Claude Code.
11. **Teams notifications** (if the Workflows question resolves).
