# Features index

Feature → files. Update in the same change that adds, moves or removes something listed here.

| Feature | Where |
|---|---|
| Health check | `GET /api/health` — `src/worker/index.ts` |
| São Paulo holidays (Easter-based included) | `saoPauloHolidays`, `easterSunday` — `src/schedule/holidays.ts` |
| Default day kinds of a month (15h/24h) | `defaultCalendar` — `src/schedule/shifts.ts` |
| Hours by calendar month | `segmentHoursByMonth`, `monthlyHoursByDev`, `monthTotalHours` — `src/schedule/shifts.ts` |
| Segment coverage check (no gap/overlap) | `findSegmentProblem` — `src/schedule/shifts.ts` |

Nothing else exists yet. Planned features and their order: [docs/TODO.md](../TODO.md).
