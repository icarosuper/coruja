# TODO — Coruja

**This file holds open work only.** A closed item is deleted from the body and gets one line in
"Closed so far". Git keeps the full text.

**Closed so far:** *(2026-11-12)* planning and repo skeleton (Worker + D1 + Svelte shell, docs);
holidays, month boundary, UI language, starting balance, Drizzle, Svelte and the typed client
decided (decisions #11–#16); release model (#17); participation weight, joining/leaving devs,
editable closed months, change log, unassigned days (#18–#22); swap sync via CSV diff + MCP (#23). Database schema and first migration (10 tables). Holidays and hour counting (`src/schedule/`). Sheet CSV reader (`src/sheet/`), checked against the November export. Scheduler (`suggestRoster`, #24). API: auth, devs, profile, months (open, edit, confirm, close), November import, sheet diff and sync (#25). Closing replaced by recorded exports; Office Script and paste-grid generator (`src/sheet/export.ts`); admin edits of someone else's profile (#26). Screens: token entry, month (arrows, calendar, day editor, confirm, export), profile, admin (#27). Generate an open month again (#28). Months opened and closed by hand; the daily cron was dropped (#7, #31). *(2026-11-13)* Domain `coruja.verme.net`; repo reviewed before going public (no secrets or real data; the first commit's nicknames stay in history; the internal process stays described). Repo public; `master` protected (PR with green `verify` and `pr-title`, owner bypasses).

## Open questions (ask the user)

- **Teams Workflows:** does the "Post to a channel when a webhook request is received" template
  exist and work in the team channel without admin approval? If not, notifications are dropped.
- **Office Scripts:** is the manager's sheet on OneDrive/SharePoint, and is the Automate tab
  available? (Required by decisions #4.)

## Build order

1. **First deploy (MVP)** — `docs/guides/development.md` "First deploy": D1, `TEAM_PASSWORD`, domain;
   then import the current month from the sheet and run the Office Script on the real sheet once.

After the MVP is live:

- **Drop `absences.note`** (unused since absences are marked day by day) in a deploy after the one
  that stopped reading it (decisions #17).

2. **Outlook `.ics` feed** per dev. Undecided: how the feed URL authenticates (a per-dev feed secret
   that can be replaced, not the dev token), where the link shows (a card on the profile), what goes
   in (own shifts, one event per shift, open months).
3. **MCP server** for Claude Code.
4. **Teams notifications** (if the Workflows question resolves).
5. **Rate limiting rule on Cloudflare** (dashboard: `verme.net` → Security → WAF → Rate limiting
   rules; the Free plan allows one, path only, per IP, 10s window): `/api/` on `coruja.verme.net`,
   50 requests per 10s, block for 10s. Slows a brute force on the team password; generous enough for
   the whole team behind one office IP.
6. **Limit team password attempts in the Worker.** Count failed
   `X-Team-Password` checks per IP (e.g. a Workers Rate Limiting binding or a D1 counter) and
   answer 429 after a few.
7. **PR previews with a staging database** — a `preview` environment in `wrangler.jsonc` (separate
   Worker `coruja-preview` + its own D1 `coruja-staging` with seed data); Workers Builds runs
   `wrangler versions upload` for non-`master` branches, building with `CLOUDFLARE_ENV=preview`
   so the Vite plugin picks that environment. One staging DB shared by all PRs.

## Export format ideas (undecided)

Today the export gives the Office Script, the paste grid and an `.xlsx` of the paste grid. Ideas for
other formats, noted for later; the user decides whether each one gets built.

- **`.ics`** — shifts in Outlook, Google Calendar or the phone, with reminders. Two shapes: a
  per-dev subscribable feed that follows swaps (build order item 2), or a one-off `.ics` download of
  the month (simpler, goes stale after a swap).
- **Text for Teams** — a "copy roster" button producing plain lines like `Seg 03 — nickname (15h)`,
  to paste in the channel when a month opens.
- **Markdown** — the same roster as a Markdown table or list, for Teams, GitHub or a wiki.
- **PDF / print** — only if someone prints or attaches the roster; a print stylesheet on the month
  screen may be enough, with no PDF generated on the server.
- **CSV** — little gain over the `.xlsx` unless a consumer shows up (an integration, an hours report
  for HR). If built, one row per shift (date, dev, start, end, hours), not the grid.
- **JSON** — likely no button needed: the API already returns the month, and the planned MCP server
  covers tools.
