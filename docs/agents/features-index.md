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
| One month's hours and expected share per dev | `monthHoursByDev` — `src/schedule/balance.ts` |
| Balances over all months + adjustments | `loadBalances`, `balancesBefore` — `src/worker/store/balances.ts` |
| Token / team password auth | `requireDev`, `requireTeamPassword`, `generateToken`, `hashToken` — `src/worker/auth.ts` |
| API errors `{ error: code }` | `ApiError` — `src/worker/errors.ts`; `app.onError` in `src/worker/index.ts` |
| Input validation (zod) | `validate` + shared schemas — `src/worker/validation.ts` |

### API routes

Under `/api`. 🔑 = dev token, 🛡️ = team password.

| Route | What | Where |
|---|---|---|
| `GET /health` | liveness | `src/worker/index.ts` |
| `GET /devs` 🔑 | devs with weight, active, balance | `routes/devs.ts` → `store/devs.ts` `listDevs` |
| `POST /devs` 🛡️ | add a dev (nickname up to 20 characters, to fit a calendar cell; starts at the average balance), returns the token once | `createDev` |
| `PATCH /devs/:id` 🛡️ | rename, (de)activate | `updateDev` |
| `POST /devs/:id/token` 🛡️ | replace the token | `issueToken` |
| `PUT /devs/:id/weight` 🔑 | set a participation weight | `setWeight` |
| `GET /me` 🔑 | own profile: rules, absences | `routes/me.ts` → `store/profile.ts` `loadProfile` |
| `PUT /me/rules` 🔑 | replace own rules | `replaceRules` |
| `POST /me/absences`, `DELETE /me/absences/:id` 🔑 | own planned absences; a new one that overlaps or touches others is merged with them into one range | `addAbsence`, `removeAbsence` |
| `GET /months` 🔑 | months and status | `routes/months.ts` → `store/months.ts` `listMonths` |
| `POST /months/:month/open` 🔑 | open with a suggested roster | `openMonth` |
| `GET /months/:month` 🔑 | calendar, hours, balances, confirmations, readiness | `monthView` |
| `GET /months/:month/log` 🔑 | change log, newest first | `monthLog` |
| `PUT /months/:month/days/:date` 🔑 | edit a day (kind + segments) | `applyDayChanges` (`edit`) |
| `POST /months/:month/confirm` 🔑 | confirm as the calling dev | `confirmMonth` |
| `POST /months/:month/close` 🔑 | close (pending confirmations allowed) | `closeMonth` |
| `POST /months/import` 🛡️ | import a month from the sheet CSV, closed (#16) | `store/sheet.ts` `importClosedMonth` |
| `POST /months/:month/sheet-diff` 🔑 | differences between the sheet CSV and the month | `sheetDifferences` |
| `POST /months/:month/changes` 🔑 | apply differences (sync, #23) | `applyDayChanges` (`sync`) |

No screens yet. Planned features and their order: [docs/TODO.md](../TODO.md).
