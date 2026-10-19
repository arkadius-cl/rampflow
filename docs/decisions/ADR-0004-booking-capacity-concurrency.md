---
title: ADR-0004 Bookable resource capacity and booking concurrency
description: One bookable_resource table for pools and single docks, capacity checked under one transaction-scoped advisory lock per site, capacity buckets as instants from the local day start, walk-ins that skip capacity, and physical dock occupancy as a partial unique index.
type: explanation
audience: [agent, developer]
tags: [adr, booking, capacity, concurrency, postgres]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/domain-standards.md]
---

# ADR-0004: Bookable resource capacity and booking concurrency

Status: accepted, 2026-10-19. Revised 2026-10-19 after the design review: one lock per site instead of per-resource row locks, buckets as instants, bookings across local midnight, `24:00`, and walk-ins.

## Context

The scope fixes the model: one `bookable_resource` of kind `pool` or `single`; a dock belongs to at most one resource; pooled docks are never booked directly (MD-03). Capacity counts planned slots of active bookings. Physical occupancy is a separate rule: one truck per dock in `called`, `at_dock` or `loading` (YD-07). Two carriers racing for the last unit must get one 201 and one 409 with a refreshed list (BK-04). Staff with `booking.force` may book over capacity (BK-02), and reducing capacity never cancels bookings (MD-03). A walk-in is a truck already standing at the gate (YD-03). So capacity is a rule enforced at write time, not an invariant the database can hold at all times.

## Options considered

**Capacity check under concurrency.**

| Option | Verdict |
|---|---|
| `EXCLUDE USING gist (dock_id WITH =, slot WITH &&)` | Expresses "at most one", not "at most N". Rejects forced bookings and the overbooked state that capacity reductions create. Rejected for capacity. |
| `SERIALIZABLE` transaction, count, insert | Correct, but every caller needs a retry loop on `40001`, and predicate locks abort unrelated bookings. |
| `SELECT ... FOR UPDATE` on each `bookable_resource` row tried | The first design. A carrier create tries resources in `(sort, id)` order and holds every lock until commit, while a reschedule locks its two resources in another order, so the two deadlock (`40P01`). It also needs a lock-only `UPDATE` policy on `bookable_resource` for every party that books. |
| `SELECT ... FOR NO KEY UPDATE` on the `site` row | One lock per site, so no ordering problem. Still needs lock-only `UPDATE` policies on `site` for the carrier party. |
| **`pg_advisory_xact_lock` on one key per site** | One lock per site: no lock order exists, so no deadlock between create, reschedule and avis edits. Needs no RLS policy for any party, and never conflicts with foreign-key `KEY SHARE` locks or site edits. Transaction-scoped, so it cannot leak through the pool, as with the job locks of [ADR-0010](ADR-0010-email-outbox-job-runner.md). |

The advisory key is invisible in the schema, so one function owns it, and a key collision between two sites only makes them wait for each other for milliseconds. Writes per site stay far below one per second at design load, so per-site serialization costs nothing measurable.

**Physical occupancy.**

| Option | Verdict |
|---|---|
| Time-range exclusion on `(dock_id, slot)` | Wrong rule. Occupancy depends on state, not on the planned slot: a late truck at dock D-03 blocks D-03 now, whatever its slot said. |
| **Partial unique index on `booking(dock_id)` where status is `called`, `at_dock` or `loading`** | Exactly the rule. The database rejects the second assignment with SQLSTATE `23505`, which maps to 409 `conflict` with reason `dock_occupied`. |

## Decision

### Data

- `bookable_resource (id, tenant_id, site_id, kind, name, directions, capacity_cap, daily_cap, sort, active)`. `capacity_cap` is allowed only for pools (check constraint).
- `resource_dock (resource_id, resource_kind, dock_id, site_id, tenant_id)`:
  - `unique (dock_id)`: a dock is in at most one resource.
  - Composite FK `(resource_id, resource_kind)` to `bookable_resource (id, kind)` plus a partial unique index on `(resource_id)` where `resource_kind = 'single'`: a single resource has at most one dock.
  - Composite FKs `(dock_id, site_id)` and `(resource_id, site_id)`: dock and resource are on the same site.
- `booking.resource_id` is the planned target. `booking.dock_id` is the physical dock assigned at the call; it may be outside the resource (YD-07, with a warning).
- A booking occupies capacity over `[starts_at, blocks_until)`, where `blocks_until = starts_at + duration + buffer`. `ends_at = starts_at + duration` is what the carrier sees.
- A load type's duration is at most 720 minutes and its buffer at most 240 (zod schema in `packages/shared/src/modules/booking/api.capacity.ts`, U4), so a booking blocks capacity for at most 16 hours.
- Active statuses for capacity: `confirmed`, `checked_in`, `called`, `at_dock`, `loading`, `done`. Final statuses free capacity.

### Capacity at an instant

`capacity(R, t)` is 0 when the site or the resource is closed at `t`. Otherwise it is the number of member docks with status `active`, capped by `capacity_cap`. Docks in `maintenance` count toward `core.max_docks` but not toward capacity.

"Closed at `t`" means one of these:

- `t` lies outside every weekly hours window of the site, or of the resource when it has its own rows. A window `[opens, closes)` converts to instants with `instantsAt` ([ADR-0012](ADR-0012-time-handling.md)); `closes = 24:00` is the start of the next local day. An overnight shift is two rows (Mon 22:00 to 24:00, Tue 00:00 to 06:00) whose instants meet, so a booking may run across midnight.
- A `closed` or `blocked` closure of the site or the resource covers `t`.
- A `holiday` closure covers `t`, is not reopened, and `booking.close_on_public_holidays` resolves `true` for the site. With the setting off, holiday rows stay stored and are ignored.

`load(R, t)` is the number of active bookings of `R` with `starts_at <= t < blocks_until`.

### Availability (read)

`checkFit` and `offersFor` are pure functions in `packages/shared/src/time/` (bucket math) and `apps/api/src/modules/booking/capacity/` (U4). They evaluate one site-local day `D`:

1. **Window.** `localDayRange(D, zone)` gives `[dayStart, dayEnd)`, 23, 24 or 25 hours. The timeline covers `[dayStart, dayEnd + 16 h)`, because a start late on `D` can block capacity on the next day.
2. **Buckets are instants.** Bucket `i` covers `[windowStart + 5i min, windowStart + 5(i+1) min)`. Never index buckets by wall time: on 2026-10-25 in Berlin the two 02:30 instants are different buckets, and on 2027-03-28 no bucket exists for 02:00 to 03:00. Day `D` alone has 276, 288 or 300 buckets.
3. **Load.** Read the active bookings of the candidate resources with `starts_at < windowEnd and blocks_until > windowStart and starts_at >= windowStart - interval '16 hours'`. The last bound keeps the read an index range scan on `(resource_id, starts_at)` and still finds a 23:30 booking of the previous day that blocks until 01:00. Load the hours, closures and holiday rows of `D` and the next day the same way.
4. **Grid.** Walk the slot grid of `D` (`booking.slot_grid_minutes`, `slotGrid` in ADR-0012). Candidate starts lie on `D`; their buckets may lie on the next day.
5. **Offer** start `s` when:
   - every bucket in `[s, s + duration + buffer)` has `load < capacity`. The buffer must fall inside opening hours too, so the last start of a day is the closing time minus duration minus buffer;
   - the resource's active bookings that start on the site-local day `D` are below `daily_cap`;
   - for carriers, `s` lies in `[now + booking.min_lead_minutes, now + booking.horizon_days]`.
6. A load type eligible at several resources offers the union of their starts.

Carriers do not read other carriers' bookings ([ADR-0002](ADR-0002-tenancy-isolation-rls.md)). Under the `carrier_at_tenant` party, the load read of step 3 runs through `asScope(tx, <tenant scope with actor system:capacity>, ...)` in the same transaction and selects only `resource_id`, `starts_at`, `blocks_until`. No booking row of another carrier leaves that function.

### Booking write

```ts
// apps/api/src/modules/booking/lifecycle/create.ts, called with the request transaction
export async function createBooking(tx: Tx, actor: BookingActor, request: CreateBooking): Promise<Booking> {
  await lockSiteCapacity(tx, request.siteId);
  const existing = await findByClientRequestId(tx, actor, request.clientRequestId); // after the lock
  if (existing) return existing;
  if (request.mode === 'walk_in') return insertBooking(tx, actor, await walkInResource(tx, request), request);
  const candidates = await eligibleResources(tx, request); // sorted by (sort, id)
  let reason: FitFailure = 'capacity_full';
  for (const r of candidates) {
    const day = await loadDayTimeline(tx, r, request.startsAt); // reads after the lock see committed rows
    const fit = checkFit(day, request); // pure: ok | capacity_full | daily_cap_reached | closed
    if (fit.ok || (request.mode === 'forced' && fit.reason !== 'closed')) return insertBooking(tx, actor, r, request);
    reason = fit.reason;
  }
  throw new ApiError('conflict', { reason, offers: await offersFor(tx, request) });
}

// apps/api/src/modules/booking/capacity/lock.ts (U4). The only caller of pg_advisory_xact_lock for capacity.
export function lockSiteCapacity(tx: Tx, siteId: SiteId): Promise<void>;
// select pg_advisory_xact_lock(hashtextextended('capacity:' || $siteId, 0))
```

- **One lock per site.** Every writer that checks capacity calls `lockSiteCapacity` once, before it reads load: create, reschedule (also across resources), and an avis edit that changes the duration. A transaction never takes it twice and never takes another capacity lock, so no lock order exists. `transitionBooking` locks the booking row first, then the site; `createBooking` has no booking row yet. Both orders end at the site lock, so they cannot form a cycle. A walk-in's check-in locks the row it just inserted, which no other transaction can see yet.
- **Writers that only remove load** (cancel, no-show, turn away, uncall, departure) do not lock. A concurrent remover can make a creator see one booking too many, which only ever rejects, never overbooks.
- **Writers that add load without checking** need no lock either, because they never reject: a walk-in, a check-in from `no_show` (the truck is there), and a staff avis edit from `checked_in` on (the truck is loaded with what it carries). They may push a slot over capacity, and the plan board flags it. `createBooking` still takes the lock for walk-ins, because it is one code path and the cost is nil.
- **Idempotent create.** The `clientRequestId` lookup runs after the lock, so a double submit finds the first booking instead of raising `23505` inside an aborted transaction. A booking `code` collision (`23505` on `(tenant_id, code)`) retries code generation up to three times inside a savepoint. A `23505` maps to 409 `dock_occupied` only when the constraint is `booking_dock_occupied`, and that insert or update also runs inside a savepoint so the handler can still read afterwards.
- **Resource choice.** A carrier booking does not choose the resource. The server tries eligible resources in `(sort, id)` order and takes the first that fits.
- **Forced** (`booking.force` with a reason) skips the capacity and daily-cap checks, never the closed check, and records `forced: true` and the reason in the `created` event.
- **Walk-in** (`booking.walk_in`, [Booking lifecycle](../reference/booking-lifecycle.md)) skips the closed, capacity and daily-cap checks, because the truck is already at the gate. It needs no `booking.force`. It starts at the grid slot that contains `now`, on the requested resource or the first eligible one, and records `walk_in: true`, `forced: false`. A truck at 05:50 before a 06:00 opening, or at a full slot, is walked in and shows as over capacity on the plan board.
- The 409 for `capacity_full` carries `details.offers`, the refreshed start list for that day, so the client can re-render without another request (BK-04).

### Hard limits

`withinLimit(tx, key, count)` locks the tenant's `org` row `FOR UPDATE`, counts, and throws 409 `limit_reached` with `{ key, limit }` when `count + 1 > limit` (`null` never blocks). It is typed to hard limits only (`HardLimitKey`). `booking.max_bookings_per_month` is soft: no write checks it, and PL-04 flags usage above 100%. Booking writes take no limit lock. A transaction that needs both takes the org row before the site capacity lock.

### Capacity reductions

Lowering `capacity_cap`, removing a dock, setting a dock to maintenance or adding a closure never touches bookings. The plan board computes `overCapacity` per booking: a booking is flagged when any bucket it occupies has `load > capacity` (MD-03). Forced bookings and walk-ins use the same flag.

### Pools and the `booking.pools` entitlement

Creating a pool or changing its docks requires `booking.pools`. Existing pools keep working when the entitlement is turned off, so a downgrade never strands booked trucks; the resource screen shows them read-only.

## Consequences

- Throughput is serialized per site. At 120,000 bookings per month across about 1,000 docks, writes per site per second stay far below one, so lock waits are milliseconds.
- The race test in U6a opens two real connections and runs both creates with `Promise.all`; it asserts one 201, one 409 with offers, and one row. A second test runs a carrier create and a staff reschedule that prefer two resources in opposite order and asserts that neither fails with `40P01`.
- Availability for one resource-day uses three indexed queries plus in-memory work on at most 300 buckets for the day plus 192 for the overhang, well inside the 200 ms target. U4 adds a seeded benchmark that fails above 200 ms for one resource-day and 1 s for a 30-resource plan board; it runs with `pnpm bench`, not in `pnpm verify`.
- U4's DST tests add the capacity cases: on Berlin 2026-10-25 a 60-minute booking at 02:30 `earlier` on a capacity-1 resource leaves 02:30 `later` offered; on 2027-03-28 the day has 276 buckets and 46 grid starts; with hours Mon 22:00 to 24:00 and Tue 00:00 to 06:00 a 90-minute load at Mon 23:30 is offered and blocks Tue 00:00 to 01:00; a booking of Mon 23:30 blocks a Tue 00:30 start.
- `btree_gist` stays installed but unused by the MVP schema.
