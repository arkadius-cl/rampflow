# Spec Delta

## Purpose

Defines how docks become bookable. Pools hold docks of one physical profile, the system builds a default pool per hall and profile, the admin splits pools by hand, and every dock stays bookable for at least one load type.

## ADDED Requirements

### Requirement: A resource has the profile of its docks
Every bookable resource SHALL have a dock profile: door type, temperature zone and ADR flag. Every dock in a resource SHALL have exactly that profile. The database SHALL reject a membership whose dock profile differs from the resource's, and SHALL reject a profile change of a dock while it is linked to a resource with the old profile. `GET /api/t/:orgId/capacity/resources` SHALL return `doorType`, `temperatureZone`, `adrAllowed`, `hallId` and `loadTypeIds` for each resource.

#### Scenario: Pool profile in the list
- **WHEN** the admin lists the resources of a site whose hall "Halle 2" has a frozen dock "T09"
- **THEN** the resource holding "T09" has `temperatureZone: "frozen"` and the `hallId` of "Halle 2"

#### Scenario: Mismatched dock into a pool
- **WHEN** the admin sends `PUT /api/t/:orgId/capacity/docks/<T09>/booking` with `{ "as": "pool", "resourceId": <ambient pool> }`
- **THEN** the response is 409 `conflict` with reason `profile_mismatch` and `dockIds` `[<T09>]`, and T09 stays in its pool

#### Scenario: Database backstop
- **WHEN** a statement inserts a `resource_dock` row whose profile columns differ from its dock's
- **THEN** the database rejects it with a foreign key violation

### Requirement: A new dock joins the default pool of its hall and profile
With `booking.pools` on, creating a dock SHALL add it, in the same transaction, to the default pool of its hall and profile. If none exists, the system SHALL create it with both directions, no caps, its hall and profile, linked to every load type of the site. A hall SHALL have at most one default pool per profile. The pool's name SHALL be the hall name, followed by the labels of every profile attribute that differs from the standard profile (dock leveler, ambient, no ADR) in the site's default locale.

#### Scenario: First dock of a hall
- **WHEN** the admin creates dock "T01" (dock leveler, ambient, no ADR) in "Halle 1" of a site with the three seeded load types
- **THEN** a pool named "Halle 1" exists with T01 as its only dock, directions inbound and outbound, and all three load types

#### Scenario: Next dock of the same profile
- **WHEN** the admin then creates "T02" with the same profile in "Halle 1"
- **THEN** T02 is in the pool "Halle 1" and no other resource was created

#### Scenario: Different profile
- **WHEN** the admin creates the frozen dock "T09" in "Halle 2" of a site whose default locale is `de`
- **THEN** T09 is in a new pool named "Halle 2 · Tiefkühl"

#### Scenario: Concurrent first docks
- **WHEN** two requests create the first two docks of the same hall and profile at the same time
- **THEN** both docks end up in the same single default pool

### Requirement: Without pools a new dock becomes a single resource
With `booking.pools` off, creating a dock SHALL create a single resource for it in the same transaction, named after the dock code, with both directions, the dock's profile, and every load type of the site. Existing pools SHALL keep working.

#### Scenario: Package without pools
- **WHEN** a tenant whose `booking.pools` override is off creates dock "D-01"
- **THEN** a single resource "D-01" holds D-01 and is linked to the site's load types

### Requirement: Every dock belongs to exactly one resource
Every dock SHALL belong to exactly one bookable resource, whatever its status. `PUT /api/t/:orgId/capacity/docks/:dockId/booking` SHALL accept only `{ as: "single" }` and `{ as: "pool", resourceId }`. A dock is made unavailable by setting its status, not by leaving its resource.

#### Scenario: "Not bookable" is gone
- **WHEN** the admin sends `PUT /api/t/:orgId/capacity/docks/<T01>/booking` with `{ "as": "none" }`
- **THEN** the response is 422 at the path `["as"]` and T01 stays in its resource

### Requirement: Every dock is bookable for at least one load type
The resource of every dock SHALL be linked to at least one active load type. A master data write that would leave a dock's resource without an active load type SHALL answer 409 `conflict` with reason `dock_without_load_type` and the affected `dockIds`, and SHALL write nothing.

#### Scenario: Unlinking the last load type
- **WHEN** the pool "Versand" is linked only to "Palletised (outbound)" and the admin sets that load type's resources to exclude "Versand"
- **THEN** the response is 409 with reason `dock_without_load_type` and the dock ids of "Versand", and the link stays

#### Scenario: Deactivating the last load type
- **WHEN** the admin deactivates the only active load type linked to a pool with docks
- **THEN** the response is 409 with reason `dock_without_load_type` and the load type stays active

#### Scenario: Concurrent deactivation of the last two load types
- **WHEN** a pool with docks is linked to exactly two active load types and two requests deactivate one each at the same time
- **THEN** one request answers 200, the other 409 with reason `dock_without_load_type`, and the pool keeps one active load type

#### Scenario: Joining a default pool without load types
- **WHEN** a new dock joins a default pool that has no active load type
- **THEN** the pool is linked to every load type of the site in the same transaction

### Requirement: The admin splits pools by moving docks
Creating a pool with `dockIds`, setting a pool's docks, or booking a dock into a pool or as single SHALL move each dock out of its current resource in one transaction. All docks of a new pool SHALL share one profile, which becomes the pool's. A new pool SHALL get the load types of the resources its docks came from. A dock removed from a pool by `PUT /capacity/resources/:id/docks` SHALL return to the default pool of its hall and profile. These writes SHALL keep requiring `booking.pools`.

#### Scenario: Split the inbound docks off
- **WHEN** the pool "Halle 1" holds T01 to T05 and the admin creates the pool "Wareneingang" with T01 to T04
- **THEN** "Wareneingang" holds T01 to T04 with the load types of "Halle 1", and "Halle 1" holds T05

#### Scenario: Removed dock goes home
- **WHEN** the admin sets the docks of the manual pool "Wareneingang" to T01 to T03
- **THEN** T04 is back in the default pool "Halle 1"

#### Scenario: Removing a dock from its own default pool
- **WHEN** the default pool "Halle 1" holds T04 and T05 and the admin sets its docks to T04 only
- **THEN** the response is 409 `conflict` with reason `dock_needs_resource` and `dockIds` `[<T05>]`, and nothing changes

#### Scenario: Mixed profiles in a new pool
- **WHEN** the admin creates a pool with the ambient dock T07 and the frozen dock T09
- **THEN** the response is 409 with reason `profile_mismatch` and `dockIds` `[<T09>]`

### Requirement: Default pools take docks of their hall only
A default pool SHALL only hold docks of its hall. A manual pool SHALL be allowed to hold docks of several halls of the same site. The system SHALL never split or merge pools on its own.

#### Scenario: Dock of another hall into a default pool
- **WHEN** the admin books dock "T06" of "Halle 2" into the default pool "Halle 1"
- **THEN** the response is 422 at the path `["resourceId"]` and T06 stays where it was

#### Scenario: Manual pool across halls
- **WHEN** the admin creates the pool "Express" with T05 of "Halle 1" and T08 of "Halle 2", both with the standard profile
- **THEN** the response is 201 and "Express" holds both docks

### Requirement: A profile or hall change moves the dock
Changing a dock's door type, temperature zone or ADR flag SHALL, in the same transaction, update its single resource, or move it from its pool into the default pool of its hall and new profile. Moving a hall SHALL move a dock in a default pool to the default pool of its new hall. A dock in a manual pool or a single resource SHALL stay there when only its hall changes. A move out of a pool SHALL require `booking.pools`.

#### Scenario: Dock becomes chilled
- **WHEN** the admin changes T05 in the pool "Halle 1" to temperature zone `chilled`
- **THEN** T05 is in the default pool "Halle 1 · Kühl" and the response shows the new profile

#### Scenario: Single dock changes profile
- **WHEN** the admin sets ADR on the single dock T08
- **THEN** T08 stays in its single resource and that resource has `adrAllowed: true`

### Requirement: The dock dialog shows what the dock is bookable for
The dock dialog SHALL show, read-only, the dock's resource (pool name, or "single dock") and the names of its active load types in the user's locale, with a link to the load types tab. When the admin changes the profile of a pooled dock, the dialog SHALL say before saving that the dock will move to the default pool of its new profile.

#### Scenario: Bookable for
- **WHEN** the admin opens dock T01 of the seeded Hamburg DC
- **THEN** the dialog shows "Bookable for" with the pool "Wareneingang" and its inbound load types

### Requirement: Existing pools survive the migration
Migrating a database whose pooled docks all have the standard profile (every seeded, test and e2e database) SHALL keep every resource, membership, load type link and booking. Each existing resource SHALL get the standard profile and no hall, so it counts as a manual pool or a single. A database with a pooled dock of another profile SHALL fail the migration on the profile foreign key and change nothing.

#### Scenario: Seeded database migrated
- **WHEN** a database seeded before this change is migrated
- **THEN** the pools "Wareneingang", "Versand", "Ramps" and "Rampen 1–6" still hold the same docks and bookings, with `hallId` null
