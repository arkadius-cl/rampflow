---
title: ADR-0004 Bookable resource capacity and booking concurrency
description: One bookable_resource table for pools and single docks, capacity checked under a FOR UPDATE lock on the resource row, daily caps in the same lock, and physical dock occupancy as a partial unique index.
type: explanation
audience: [agent, developer]
tags: [adr, booking, capacity, concurrency, postgres]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/domain-standards.md]
---

# ADR-0004: Bookable resource capacity and booking concurrency

Status: accepted, 2026-10-19.

## Context

The scope fixes the model: one `bookable_resource` of kind `pool` or `single`; a dock belongs to at most one resource; pooled docks are never booked directly (MD-03). Capacity counts planned slots of active bookings. Physical occupancy is a separate rule: one truck per dock in `called`, `at_dock` or `loading` (YD-07). Two carriers racing for the last unit must get one 201 and one 409 with a refreshed list (BK-04). Staff with `booking.force` may book over capacity (BK-02), and reducing capacity never cancels bookings (MD-03). So capacity is a rule enforced at write time, not an invariant the database can hold at all times.

## Options considered

**Capacity check under concurrency.**

| Option | Verdict |
|---|---|
| `EXCLUDE USING gist (dock_id WITH =, slot WITH &&)` | Expresses "at most one", not "at most N". Rejects forced bookings and the overbooked state that capacity reductions create. Rejected for capacity. |
| `SERIALIZABLE` transaction, count, insert | Correct, but every caller needs a retry loop on `40001`, and predicate locks abort unrelated bookings. |
| `pg_advisory_xact_lock(hash(resource_id))` | Works, but the lock key is invisible in the schema and hashes can collide. |
| **`SELECT ... FOR UPDATE` on the `bookable_resource` row** | Serializes writers per resource for milliseconds, needs no retry, shows the lock in code, and treats pools and single docks the same way. |

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
- Active statuses for capacity: `confirmed`, `checked_in`, `called`, `at_dock`, `loading`, `done`. Final statuses free capacity.

### Capacity at an instant

`capacity(R, t)` is 0 when the site or the resource is closed at `t` (weekly hours, closures and blocks; [ADR-0012](ADR-0012-time-handling.md)). Otherwise it is the number of member docks with status `active`, capped by `capacity_cap`. Docks in `maintenance` count toward `core.max_docks` but not toward capacity.

`load(R, t)` is the number of active bookings of `R` with `starts_at <= t < blocks_until`.

### Availability (read)

A pure function in `packages/shared/src/time/` and `apps/api/src/modules/booking/resources/availability.ts` evaluates one site-local day on 5-minute buckets:

1. Load the resource, its docks, the site and resource hours, the closures that overlap the day, and the active bookings that overlap the day.
2. Walk the slot grid of the day (`booking.slot_grid_minutes`, DST rules in ADR-0012).
3. Offer start `s` when every bucket in `[s, s + duration + buffer)` has `load < capacity`, the resource's bookings starting that local day are below `daily_cap`, and, for carriers, `s` lies in `[now + booking.min_lead_minutes, now + booking.horizon_days]`.
4. A load type eligible at several resources offers the union of their starts.

### Booking write

```ts
// apps/api/src/modules/booking/lifecycle/create.ts, called with the request transaction
export async function createBooking(tx: Tx, actor: BookingActor, request: CreateBooking): Promise<Booking> {
  const candidates = await eligibleResources(tx, request); // sorted by (sort, id)
  let reason: FitFailure = 'capacity_full';
  for (const r of candidates) {
    await tx.execute(sql`select 1 from bookable_resource where id = ${r.id} for update`);
    const day = await loadDayTimeline(tx, r, request.startsAt); // reads after the lock see committed rows
    const fit = checkFit(day, request); // pure: ok | capacity_full | daily_cap_reached | closed
    if (fit.ok || (request.force && fit.reason !== 'closed')) return insertBooking(tx, actor, r, request);
    reason = fit.reason;
  }
  throw new ApiError('conflict', { reason, offers: await offersFor(tx, request) });
}
```

- Every writer that can add load takes the lock: create, walk-in, reschedule, and an avis edit that changes the duration. Writers that only remove load (cancel, no-show, turn away, departure) do not lock. A concurrent remover can make a creator see one booking too many, which only ever rejects, never overbooks.
- A carrier booking does not choose the resource. The server tries eligible resources in `(sort, id)` order and takes the first that fits. Every transaction locks in the same order and stops at the first fit, so two transactions cannot deadlock.
- Rescheduling to another resource locks both rows in id order.
- A forced booking (`booking.force` with a reason) skips the capacity and daily-cap checks, never the closed check, and records `forced: true` and the reason in the `created` event.
- The 409 for `capacity_full` carries `details.offers`, the refreshed start list for that day, so the client can re-render without another request (BK-04).

### Hard limits

`withinLimit(tx, key, count)` locks the tenant's `org` row `FOR UPDATE`, counts, and throws 409 `limit_reached` with `{ key, limit }` when `count + 1 > limit` (`null` never blocks). It is typed to hard limits only (`HardLimitKey`). `booking.max_bookings_per_month` is soft: no write checks it, and PL-04 flags usage above 100%. Lock order is always the org row before resource rows.

### Capacity reductions

Lowering `capacity_cap`, removing a dock, setting a dock to maintenance or adding a closure never touches bookings. The plan board computes `overCapacity` per booking: a booking is flagged when any bucket it occupies has `load > capacity` (MD-03).

### Pools and the `booking.pools` entitlement

Creating a pool or changing its docks requires `booking.pools`. Existing pools keep working when the entitlement is turned off, so a downgrade never strands booked trucks; the resource screen shows them read-only.

## Consequences

- Throughput is serialized per resource. At 120,000 bookings per month across about 1,000 docks, writes per resource per second stay far below one, so lock waits are milliseconds.
- The race test in U6 opens two real connections and runs both creates with `Promise.all`; it asserts one 201, one 409 with offers, and one row.
- Availability for one resource-day uses three indexed queries plus in-memory work on at most 288 buckets, well inside the 200 ms target. U4 adds a seeded benchmark test that fails above 200 ms for one resource-day and 1 s for a 30-resource plan board.
- `btree_gist` stays installed but unused by the MVP schema.
