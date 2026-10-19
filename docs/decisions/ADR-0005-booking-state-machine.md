---
title: ADR-0005 Booking and visit lifecycle as one state machine with one writer
description: Why the booking carries the visit lifecycle, why the transition table lives in packages/shared as data, and why a single API function writes every status change and its event.
type: explanation
audience: [agent, developer]
tags: [adr, booking, yard, state-machine, events]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/domain-standards.md]
---

# ADR-0005: Booking and visit lifecycle as one state machine with one writer

Status: accepted, 2026-10-19.

## Context

The scope makes the booking carry the visit lifecycle (walk-ins are staff bookings) and requires an append-only event per transition with actor and UTC time. Booking, yard, safety, the driver PWA and the jobs all change booking state: carriers cancel, gate operators check in, dock operators record progress, the no-show job marks bookings, and the web app must know which buttons to show. Without one owner, each of those writers would grow its own `if (status === ...)` checks, and they would drift.

## Options considered

| Option | Verdict |
|---|---|
| Two aggregates, booking and visit (domain research §3) | The scope rejected it. One state machine is simpler for an MVP where every visit has a booking. |
| Status column updated by each module, events written by triggers | Triggers hide logic from TypeScript and cannot see the actor or the reason without extra session variables. Guards stay scattered. |
| Event sourcing with the booking row as a projection rebuilt from events | Correct, but every read pays for it or needs a projection pipeline. Too much machinery for 10 states. |
| **Transition table as data plus one writer function** | The table answers "who may do what from where" for the API and the UI. One function enforces it and writes the row, the event and the side effects in one transaction. |

## Decision

1. **States.** Active: `confirmed`, `checked_in`, `called`, `at_dock`, `loading`, `done`. Final: `departed`, `cancelled`, `no_show`, `turned_away`. `requested` is reserved for `booking.approval` and has no transitions in the MVP. `no_show` is final for capacity but allows one way back: check-in on the same site-local day (YD-02).
2. **The table is data in `packages/shared/src/modules/booking/lifecycle.ts`.** Each command names its source states, target state, permission, the actor parties allowed, and its input schema. [Booking lifecycle](../reference/booking-lifecycle.md) is the full table. The web app reads the same table to decide which actions to offer, so the UI and the API cannot disagree.
3. **One writer.** `transitionBooking(tx, actor, bookingId, command)` in `apps/api/src/modules/booking/lifecycle/transition.ts` is the only code that updates `booking.status`. It:
   1. Locks the booking row `FOR UPDATE`.
   2. Looks up the command in the table and checks the source state and the actor.
   3. Runs the command's guards (cutoff, safety enforcement, same local day, dock free). Guards are pure functions over a loaded context, so they are tested without a database.
   4. Stamps the state's timestamp column (`checked_in_at`, `called_at`, ...), writes the projection columns, and inserts one `booking_event` row.
   5. Runs side effects inside the same transaction: driver link revocation or expiry, outbox emails.
   A Biome rule forbids `update(booking).set({ status })` outside that file.
4. **Creation is not a transition.** `createBooking` (capacity, [ADR-0004](ADR-0004-booking-capacity-concurrency.md)) inserts a `confirmed` booking and its `created` event. Walk-in is `createBooking` followed by the `check_in` command in the same transaction.
5. **Events.** `booking_event (id, tenant_id, booking_id, carrier_id, type, from_status, to_status, at, actor_party, actor_user_id, actor_job, data)` is append-only: RLS grants no `UPDATE`, and only the retention job deletes. `data` is a zod-typed discriminated union per event type. Actor identities are visible to tenant admins only (`booking.view_actors`, works council rule).
6. **Skipped states** leave their timestamp NULL (YD-08). KPIs that need a missing timestamp skip that visit (RP-01).
7. **Idempotent retries.** A command whose target state the booking already has, with the same input, returns 200 with the current booking and writes no event. Any other mismatch returns 409 `conflict` with reason `invalid_transition` and the current status.

## Consequences

- Adding a state or command is one table entry, one guard, and the tests that cover it. The compiler forces exhaustive handling where code switches on status.
- The yard module owns no table. It calls `transitionBooking` and reads bookings.
- KPI queries read timestamp columns on `booking`, not events, so the 90-day KPI query stays one indexed scan.
