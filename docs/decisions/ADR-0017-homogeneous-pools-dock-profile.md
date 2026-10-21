---
title: ADR-0017 Homogeneous pools and the dock profile
description: Why a bookable resource carries the door type, temperature zone and ADR flag of its docks under composite foreign keys, why each hall gets one default pool per profile, why pool membership moves docks, and why every dock stays in exactly one resource with an active load type.
type: explanation
audience: [agent, developer]
tags: [adr, booking, capacity, master-data, onboarding, postgres]
status: stable
updated: 2026-10-21
related: [docs/decisions/ADR-0004-booking-capacity-concurrency.md, docs/reference/data-model.md, docs/reference/api-routes.md, docs/explanation/mvp-scope.md, docs/explanation/research/domain-standards.md, openspec/changes/03-tenant-onboarding/design.md]
---

# ADR-0017: Homogeneous pools and the dock profile

Status: accepted, 2026-10-21 (change 03, stories MD-02, MD-03 and ON-02). Amends [ADR-0004](ADR-0004-booking-capacity-concurrency.md) "Data" and "Pools and the `booking.pools` entitlement".

## Context

ADR-0004 counts the active docks of a pool as interchangeable units of capacity. Until change 03, `bookable_resource` had no profile of its own, so a pool could hold a frozen door next to ambient ones. Capacity then offered the frozen door to every load type of the pool.

A new dock went into no resource. It stayed unbookable until the admin opened the pool editor, and `PUT /capacity/docks/:dockId/booking` accepted `{ as: 'none' }` to take a dock out again ("Not bookable"). Change 03 activates a tenant with its first dock (ON-02). That dock has to be bookable the moment it exists, so the system must place it on its own. Automatic placement is safe only when the database guarantees what a pool holds.

Five service paths write memberships: `createDock`, `updateDock`, `bookDock`, `createResource` and `putResourceDocks`. A rule that one of them forgets mixes a reefer door into an ambient pool.

## Options considered

**Where the bookable characteristics live.**

| Option | Verdict |
|---|---|
| Load types per dock, as Opendock (`Dock.loadTypeIds`, and an appointment requires a `dockId`, [live spec](https://neutron.opendock.com/docs-json)) and GoRamp do | Those systems book an exact door. rampflow books a pool and assigns the door on arrival, like the loading point of SAP Dock Appointment Scheduling, "a group of docks with similar characteristics" ([SAP Help](https://help.sap.com/saphelp_ewm94/helpdata/en/fe/7579723f4c4a5aa8e3b9b871275549/content.htm)). Per-dock load types break ADR-0004's count of interchangeable docks. Rejected. |
| Profile on the pool, checked only in the service | Five paths write memberships. One missed path mixes profiles, and nothing notices. Rejected. |
| A taxonomy beyond door type, temperature zone and ADR | No standard exists. DIN EN 1398 covers dock levellers only, and EN 1570 covers lift tables. Rejected. |
| **Profile on the pool and on each membership, held by composite foreign keys** | The database rejects a mixed pool on every path. Oracle OTM makes the same choice: its rules sit on a door or a door group. The three columns already drive real filtering: MPREIS (2025) groups ramps by goods area, and IBM Sterling restricts reefer trucks to specific docks. |

**How many default pools a hall gets.**

| Option | Verdict |
|---|---|
| One per hall, whatever the profile | The product owner's first wording ("all docks of a hall form one pool"). A hall with one frozen door would offer that door to every load type of the pool. Rejected. |
| **One per hall and profile** | A new dock always has a pool that fits it, and a hall of standard docks still gets exactly one pool. |

**What happens to a dock that a pool takes.**

| Option | Verdict |
|---|---|
| Docks stay free until added, and adding a held dock answers 409 `dock_in_resource` | With every dock placed at creation, no dock is ever free. A new pool could never get a dock. Rejected. |
| **Membership moves the dock out of its current resource** | Splitting a default pool is one request. A dock is never in two resources and never in none. |

## Decision

### Profile columns and composite keys

- `bookable_resource` gains `door_type`, `temperature_zone` and `adr_allowed`, all `not null`, checked against `DoorType` and `TemperatureZone`. It gains a nullable `hall_id` with the foreign key `bookable_resource_hall_fk` `(hall_id, site_id)` to `hall (id, site_id)` and the check `bookable_resource_hall_check`, `hall_id is null or kind = 'pool'`.
- `bookable_resource_id_profile_key` is unique on `(id, door_type, temperature_zone, adr_allowed)`. On `dock`, `dock_id_profile_key` is the same key over the dock's existing profile columns.
- `resource_dock` gains the three profile columns and two composite foreign keys, both `on update no action`:
  - `resource_dock_dock_profile_fk`: `(dock_id, door_type, temperature_zone, adr_allowed)` to `dock`.
  - `resource_dock_resource_profile_fk`: `(resource_id, door_type, temperature_zone, adr_allowed)` to `bookable_resource`.
- A membership therefore matches both its dock and its resource. A pool holds docks of one profile. A dock cannot change its profile while a membership with the old one references it.
- The value set `ResourceDockConstraint` names the constraints of `resource_dock` that the service maps. `ProfileForeignKey` is its subset of the two profile keys. A `23503` on a `ProfileForeignKey` member maps to 409 `conflict` with `ConflictReason.profile_mismatch`. This is the backstop for concurrent edits. The service checks the profile first and names the docks that differ in `dockIds`.
- Every writer passes the dock's profile (`DockProfile` in `booking/capacity/placement.ts`). The column defaults exist only so the migration can add the columns to tables that have rows.
- `ResourceView` gains `doorType`, `temperatureZone`, `adrAllowed`, `hallId` and `loadTypeIds`. RLS on both tables is unchanged.

### Default pools per hall and profile

`placeDock(tx, req, dock, origin)` in `booking/capacity/placement.ts` puts a dock that has no resource where it belongs:

- With `booking.pools` on, it joins the default pool of its hall and profile. That pool is the `bookable_resource` row with the dock's `hall_id` and profile. The partial unique index `bookable_resource_default_pool_key` on `(hall_id, door_type, temperature_zone, adr_allowed) where hall_id is not null` allows one per hall and profile.
- If the pool is missing, `placeDock` inserts it with `on conflict do nothing` on that index and selects it again. Two concurrent first docks of one hall therefore end in one pool. The second insert waits for the first commit, does nothing, and its select finds the row. A new default pool serves both directions, has no caps, and is linked to every load type of the site. An existing default pool without an active load type gets the site's load types too, so a new dock never fails on a pool the admin emptied.
- With `booking.pools` off, the dock gets a single resource of its own, named by its code, with both directions and the dock's profile. `singleFor` reuses a dockless single of that name before it inserts one. Without an active load type, the single gets the load types of `origin` (the resource the dock just left), or the site's for a new dock.

A default pool is named after its hall, followed by a label for each attribute off the standard profile (dock leveler, ambient, no ADR), in the order zone, door type, ADR. The labels come from `core:sites.zones` and `core:sites.door_types` in the site's default locale, plus the literal "ADR". The name is cut to 80 characters: "Halle 1", "Halle 2 · Tiefkühl", "Hall A · Ground level · ADR". The admin may rename it. It stays the default pool, because that status is `hall_id`, not the name.

A default pool takes docks of its own hall only. `bookDock` and `putResourceDocks` answer 422 at `resourceId` or `dockIds[i]` otherwise. A manual pool (`hall_id` null) may span the halls of its site. The system never splits or merges a pool. The admin splits by hand (MD-03).

### Membership moves docks

- `DockBooking` loses its `none` variant. Its `as` discriminator is now a member of `ResourceKind` (`single` or `pool`), and the value set `DockBookingKind` is gone. A dock is taken out of service by its status (`inactive`, `maintenance`), never by leaving its resource.
- `createResource` requires one profile for all its docks. Otherwise it answers 409 `profile_mismatch` with the docks that differ from the first. The resource takes that profile. Each dock moves out of its current resource. A single that loses its dock is deactivated. The new resource serves the union of the load types of the resources its docks left.
- `putResourceDocks` checks the profile and the hall, then moves added docks in. Removed docks go back through `placeDock` to the default pool of their hall and profile. When the edited pool is that default pool, nowhere is left to go, and the answer is 409 `conflict` with `ConflictReason.dock_needs_resource` and the removed `dockIds`.
- `bookDock` (`PUT /capacity/docks/:dockId/booking`) moves one dock to a single or a pool, with the same profile and hall checks.
- `updateDock` handles a profile change in the same transaction. A single resource takes the dock's new profile. A pooled dock moves to the default pool of its hall and new profile. A dock in a default pool whose hall changes moves to the default pool of the new hall. A dock in a manual pool or a single stays when only its hall changes. A dock with no resource, from data older than this ADR, is placed on its next update.
- Taking a dock out of a pool needs `booking.pools`, on every path. Without it, the answer is 403 `entitlement_required`.
- `ConflictReason.dock_in_resource` remains only for the race that the primary key of `resource_dock` catches: two concurrent moves of one dock.

### Every dock in exactly one resource with an active load type

Every dock belongs to exactly one bookable resource, whatever its status, and that resource is linked to at least one active load type. An inactive load type offers nothing, so it does not count. The rule spans `resource_dock`, `load_type_resource` and `load_type`, so no single `CHECK` can hold it. The service checks it per write.

`assertBookable(tx, tenantId, resourceIds)` selects the docks of the given resources whose resource has no active load type. If it finds any, it throws 409 `conflict` with `ConflictReason.dock_without_load_type` and their `dockIds`, and the transaction writes nothing. It runs at the end of `createDock`, `updateDock`, `bookDock`, `createResource` and `putResourceDocks` on the resources they wrote, in `putLoadTypeResources` on the resources the load type no longer serves, and in `updateLoadType` with `active: false` on its resources. The check covers only the resources a write touched, so a site with legacy unplaced docks can still be repaired dock by dock.

Two writes under read committed can each see the other's load type as still active. Both checks pass, and the resource ends with none. Every one of these writes therefore first calls `lockSiteCapacity(tx, siteId)`, the per-site advisory lock of ADR-0004. Before the lock they read only the row that names the site. Load types, resources and docks all belong to one site, so the lock serializes every write that can break the rule. A separate lock key would need a fixed order against the capacity lock and gains nothing.

`placement.test.ts` builds a site through the services, runs each write path, and asserts after each one that no dock is without a resource or in a resource without an active load type.

### Migration

The one generated migration, `0009_03-tenant-onboarding.sql`, adds the columns with the standard profile as default (`dock_leveler`, `ambient`, `false`), then the checks, the unique keys, the default pool index and the foreign keys. It contains no custom SQL ([ADR-0001](ADR-0001-data-access-drizzle-node-postgres.md)).

- Every existing resource and membership gets the standard profile. Every seeded and test dock has that profile, so the foreign keys validate.
- Existing pools keep their docks, load types, hours, closures and bookings. Their `hall_id` is null, so they count as manual pools. The next new dock of such a hall creates the hall's default pool.
- A database with a pooled dock of another profile fails on `resource_dock_dock_profile_fk` inside the migration transaction and changes nothing. No seeded or test database has one. The remedy is `pnpm db:reset && pnpm db:seed`.

## Consequences

- Master data writes now wait on the same per-site lock as booking writes. They are rare and short, so a booking waits for milliseconds at most.
- `createDock` writes into the booking module's tables under `core.manage_sites`, as `createSite` already does through `seedLoadTypes`. The tenant admin holds both `core.manage_sites` and `booking.manage_resources`.
- A profile or hall change moves a dock that the admin did not touch in the pool editor. The dock dialog says so before saving and shows "Bookable for", the dock's resource and its active load types.
- An admin cannot unlink or deactivate the last active load type of a resource with docks. The 409 names the docks.
- A later change can restrict load types to a profile, such as "frozen only", because the pool carries the profile. This ADR does not filter load types by profile.
- The slot capacity research behind these decisions is §2 of [Domain standards](../explanation/research/domain-standards.md).
