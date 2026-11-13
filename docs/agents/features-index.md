# Features index

Feature → files. Update in the same change that adds, moves or removes something listed here.

| Feature | Where |
|---|---|
| Health check | `GET /api/health` — `src/worker/index.ts` |
| São Paulo holidays (Easter-based included) | `saoPauloHolidays`, `easterSunday` — `src/schedule/holidays.ts` |
| Default day kinds of a month (15h/24h) | `defaultCalendar` — `src/schedule/shifts.ts` |
| Hours by calendar month | `segmentHoursByMonth`, `monthlyHoursByDev`, `monthTotalHours` — `src/schedule/shifts.ts` |
| Segment coverage check (no gap/overlap) | `findSegmentProblem` — `src/schedule/shifts.ts` |
| Profile rules → preference on a date | `preferenceOn` — `src/schedule/preferences.ts` |
| Suggested roster for a month | `suggestRoster` — `src/schedule/scheduler.ts`; try it: `bun run suggest` (`scripts/suggest-roster.ts`) |
| Read the Banking roster from the sheet CSV | `readSheetRoster` — `src/sheet/roster.ts` (CSV: `src/sheet/csv.ts`) |
| Write the month to the sheet: Office Script, paste grid | `bankingCells`, `officeScript`, `pasteGrid` — `src/sheet/export.ts` |
| One month's hours and expected share per dev | `monthHoursByDev` — `src/schedule/balance.ts` |
| Balances over all months + adjustments | `loadBalances`, `balancesBefore` — `src/worker/store/balances.ts` |
| Token / team password auth | `requireDev`, `requireTeamPassword`, `requireDevOrTeamPassword`, `generateToken`, `hashToken` — `src/worker/auth.ts` |
| API errors `{ error: code }` | `ApiError` — `src/worker/errors.ts`; `app.onError` in `src/worker/index.ts` |
| Input validation (zod) | `validate` + shared schemas — `src/worker/validation.ts` |
| São Paulo date, default month | `saoPauloDate`, `defaultMonth` — `src/schedule/calendar.ts` |

### API routes

Under `/api`. 🔑 = dev token, 🛡️ = team password.

| Route | What | Where |
|---|---|---|
| `GET /health` | liveness | `src/worker/index.ts` |
| `GET /devs` 🔑 or 🛡️ | devs with weight, active, balance | `routes/devs.ts` → `store/devs.ts` `listDevs` |
| `POST /devs` 🛡️ | add a dev (nickname up to 20 characters, to fit a calendar cell; starts at the average balance), returns the token once | `createDev` |
| `PATCH /devs/:id` 🛡️ | rename, (de)activate | `updateDev` |
| `POST /devs/:id/token` 🛡️ | replace the token | `issueToken` |
| `PUT /devs/:id/weight` 🔑 or 🛡️ | set a participation weight | `setWeight` |
| `GET /me` 🔑 | own profile: rules, absences, months that already have a roster | `routes/me.ts` → `store/profile.ts` `loadProfile` |
| `PUT /me/rules` 🔑 | replace own rules | `replaceRules` |
| `PUT /me/absences` 🔑 | mark or clear every day of a range as one the dev can't take; answers the merged periods | `setAbsenceDays` |
| `GET /devs/:id/profile`, `PUT /devs/:id/rules`, `PUT /devs/:id/absences` 🛡️ | someone else's profile, edited by an admin | `routes/devs.ts` → `store/profile.ts` |
| `GET /months` 🔑 | months and when each was last exported | `routes/months.ts` → `store/months.ts` `listMonths` |
| `POST /months/:month/open` 🔑 | open with a suggested roster, any time (#7) | `openMonth` |
| `DELETE /months/:month` 🔑 | close: undo the opening of the newest month, not started yet, exported or not (#31) | `closeMonth` |
| `POST /months/:month/regenerate` 🔑 | a new suggestion from today's profiles, before the export and on the newest month; hand edits and confirmations go (#28) | `regenerateMonth` |
| `GET /months/:month` 🔑 | calendar, hours, balances, confirmations, readiness, last export and changes after it, each active dev's preferences per date, hand edits since the suggestion | `monthView` |
| `GET /months/:month/log` 🔑 | change log, newest first | `monthLog` |
| `PUT /months/:month/days/:date` 🔑 | edit a day (kind + segments) | `applyDayChanges` (`edit`) |
| `POST /months/:month/confirm`, `DELETE /months/:month/confirm` 🔑 | confirm as the calling dev, or take it back (until the export) | `confirmMonth`, `unconfirmMonth` |
| `POST /months/:month/export` 🔑 | record an export and return the Office Script or the paste grid (pending confirmations allowed, empty days refused, #26) | `exportMonth` |
| `POST /months/import` 🔑 | import the first month from the sheet CSV, as already exported; refused once any month exists (#16) | `store/sheet.ts` `importMonth` |
| `POST /months/sheet-diff` 🔑 | the sheet CSV's month and its differences from the roster | `sheetDifferences` |
| `POST /months/:month/changes` 🔑 | apply differences (sync, #23) | `applyDayChanges` (`sync`) |

| `GET /team/check` 🛡️ | checks the team password (admin screen) | `src/worker/index.ts` |

### Screens

Svelte, in `src/web/`. Shell, header and nav: `App.svelte`; routes: `router.svelte.ts`.

| Screen | Route | Where |
|---|---|---|
| Token entry | `#/entrar` | `TokenEntry.svelte` |
| Month: arrows, state, confirm, export menu, "⋯" menu to generate the roster again | `#/mes`, `#/mes/YYYY-MM` | `month/MonthPage.svelte`, `MonthHeader.svelte`, `ExportNotice.svelte`, `RegenerateDialog.svelte` |
| Month calendar (grid; list of days on phones), today, "destacar meus dias" | | `month/MonthCalendar.svelte`, `TodayChip.svelte`, `HighlightSwitch.svelte` |
| Day editor (who, split, 15h/24h, preferences per dev) | | `month/DayEditor.svelte` |
| Hours and balance, change log | | `month/MonthSidePanel.svelte` |
| Profile: weight, weekday rules, days I can't (tap or drag on two months side by side, one on phones; warning on months with a roster) | `#/perfil` | `profile/ProfilePage.svelte`, `AbsenceCalendar.svelte` |
| Admin: devs, tokens, sheet diff / sync | `#/admin` | `admin/AdminPage.svelte`, `AdminUnlock.svelte` |
| Someone else's profile, as admin | `#/admin/dev/:id` | `profile/ProfilePage.svelte` with `devId` |
| `.xlsx` of the paste grid | | `src/web/xlsx.ts` |

Planned features and their order: [docs/TODO.md](../TODO.md).
