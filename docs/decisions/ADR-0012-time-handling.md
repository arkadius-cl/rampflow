---
title: ADR-0012 Time handling with UTC instants, site IANA zones and a DST-safe slot grid
description: How rampflow stores instants and local wall-clock values, generates slots across DST gaps and folds, counts daily caps and KPI days in site-local days, and labels times for every viewer.
type: explanation
audience: [agent, developer]
tags: [adr, time, dst, booking, i18n]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/domain-standards.md, docs/decisions/ADR-0004-booking-capacity-concurrency.md]
---

# ADR-0012: Time handling with UTC instants, site IANA zones and a DST-safe slot grid

Status: accepted, 2026-10-19.

## Context

Sites sit in several EU zones, and carriers and dispatchers may view them from another zone. The scope requires UTC `timestamptz` instants, an IANA zone per site, a zone snapshot on each booking, site time with zone label for every role (plus the viewer's own time when it differs), a slot grid that walks local wall-clock times, skips spring-forward gaps and labels both instants in autumn folds, elapsed-minute durations, daily caps and KPI days per site-local day, and tests on Europe/Berlin 2026-10-25 and 2027-03-28 plus a Europe/Bucharest site viewed from Berlin.

## Options considered

| Option | Verdict |
|---|---|
| Store local times with offsets (`timestamp with time zone` semantics in app code) | An offset without a zone cannot answer "what is 08:00 tomorrow". |
| Temporal API | Not in Safari yet (domain research §6); a polyfill costs bundle size in the driver PWA. |
| **`Date` instants plus date-fns 4 and `@date-fns/tz`, with local values as branded strings** | Already in the stack. `tzOffset` gives the offset at any instant, which is all the grid algorithm needs. |

## Decision

### Representation

| Kind | Database | TypeScript | Wire (JSON) |
|---|---|---|---|
| Instant | `timestamptz` | `Date` | ISO 8601 UTC, `2026-10-25T06:30:00.000Z` |
| Site zone | `text`, validated | `TimeZone` (branded) | IANA name |
| Local date | `date` | `LocalDate` (branded `YYYY-MM-DD`) | `YYYY-MM-DD` |
| Wall time (hours) | `time` (`24:00` allowed for closing) | `LocalTime` (branded `HH:mm`) | `HH:mm` |
| Local date-time (closures) | `timestamp` without zone | `LocalDateTime` | `YYYY-MM-DDTHH:mm` |
| Duration | `integer` minutes | `number` | `number` |

- A zone is valid when `new Intl.DateTimeFormat('en', { timeZone })` does not throw. Unknown zones return 422 (MD-01).
- `booking.site_time_zone` snapshots the site zone at creation. All later computation for that booking uses the snapshot.
- Weekly hours are `(weekday 1..7, opens, closes)` in local wall time, ISO weekdays. An overnight shift is two rows.
- Closures and blocks store local date-times, so a closure "all day on 2026-12-24" stays all day even if the zone's rules change.

### The shared time module

`packages/shared/src/time/` (U4) is pure and runs in the API, the web app and the driver PWA:

```ts
export function localDayRange(day: LocalDate, zone: TimeZone): { start: Date; end: Date }; // 23, 24 or 25 h
export function siteDay(instant: Date, zone: TimeZone): LocalDate;
export function instantsAt(day: LocalDate, time: LocalTime, zone: TimeZone): Date[];       // 0 in a gap, 2 in a fold
export function slotGrid(day: LocalDate, zone: TimeZone, gridMinutes: number): GridSlot[];
export interface GridSlot { start: Date; wallTime: LocalTime; fold: 'earlier' | 'later' | null }
export function formatSiteTime(instant: Date, zone: TimeZone, locale: StaffLocale | DriverLocale): string; // "08:30 CET"
```

`instantsAt` finds every instant whose wall time in `zone` equals the requested one:

1. Collect the distinct offsets in force on that day: `tzOffset(zone, dayStart)` and `tzOffset(zone, dayEnd)`.
2. For each offset `o`, compute `utc = Date.UTC(y, m, d, h, min) - o minutes`.
3. Keep `utc` when formatting it back in `zone` gives the same wall time.

A spring-forward gap keeps none (02:30 on 2027-03-28 in Berlin), so the grid skips it. An autumn fold keeps two (02:30 on 2026-10-25 in Berlin, at UTC+2 and UTC+1), so the grid offers both and marks them `earlier` and `later`. The UI labels them with the offset ("02:30 GMT+2", "02:30 GMT+1").

### Rules

- **Durations are elapsed minutes.** `ends_at = starts_at + duration`, `blocks_until = ends_at + buffer`, computed on instants. A 60-minute slot across the autumn fold lasts 60 real minutes.
- **Hours on DST days.** An open window `[opens, closes)` converts with `instantsAt`; if `opens` falls in a gap, the window starts at the first existing instant after it.
- **Days.** A daily cap counts bookings whose `starts_at` falls in `localDayRange(siteDay(starts_at))`. "Today" for gate lists, the no-show day rule (YD-02) and KPI date filters all use `siteDay` with the site zone. KPI queries turn the site-local date range into one instant range per site, so they stay indexed range scans.
- **Display.** `formatSiteTime` uses `Intl.DateTimeFormat` with `timeZoneName: 'short'` and these formatting locales: `de` for de, `en-GB` for en, `pl` for pl. Measured on Node 24 for Europe/Berlin in January: `de` gives "08:30 MEZ", `en-GB` gives "08:30 CET", `pl` gives "08:30 CET". Plain `en` would give "GMT+1", which is why en uses `en-GB`. Driver locales use their own tag. When the viewer's zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) differs from the site zone, the UI adds the viewer's time as a secondary hint.
- **Emails** format times in the site zone with the zone label of the recipient's locale. The server's own zone is never used.
- **No implicit clocks.** Domain code takes `now` from the injected `Clock` and never calls `new Date()` or SQL `now()`. Column defaults such as `created_at default now()` are the only exception.

### Tests (U4)

- Europe/Berlin, 2026-10-25, 30-minute grid: 50 slots, with 02:00 and 02:30 each appearing twice (`earlier` and `later`); `localDayRange` is 25 hours.
- Europe/Berlin, 2027-03-28: 46 slots, 02:00 and 02:30 missing; `localDayRange` is 23 hours.
- A 60-minute booking starting 02:30 `earlier` on 2026-10-25 ends at 02:30 `later` wall time.
- A Europe/Bucharest site on 2026-10-25 viewed with zone Europe/Berlin: the fold is at 03:00 to 04:00 Bucharest time, the labels read EET and EEST, and the viewer hint shows Berlin time one hour earlier.

## Consequences

- One small module holds all calendar math, and every surface uses it, so the plan board, the carrier slot picker, the driver PWA and the emails agree on what "08:30" means.
- `@date-fns/tz` is the only time-zone dependency; tzdata comes from the runtime's ICU.
