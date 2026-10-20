# Design

## Context

- **Depends on 02.** 02 adds `org.activated_at` on `org` (null means onboarding; existing tenants are backfilled with `created_at`; tenants created by PL-01 also start with null), the value set `TenantStatus` (`onboarding`, `active`) in `packages/shared/src/modules/core/values.ts`, and `tenantStatus({ activatedAt })` in `packages/shared/src/modules/core/tenant-status.ts`. Every status is computed with `tenantStatus`. 03 writes the column; it does not add it.
- **Value sets** follow ADR-0019: each closed set is one self-keyed `as const` object with a type of the same name, and code uses its members, never the string. This change adds `OnboardingStep` (`site`, `hall`, `dock`), `HoursTemplate` (`one_shift`, `two_shifts`, `custom`), its subset `PresetHoursTemplate` (`one_shift`, `two_shifts`) and `OnboardingCase` (`blocked`) to `packages/shared/src/modules/core/values.ts`. It adds members to the cross-cutting sets of `@rampflow/shared/values`: `ErrorCode.onboarding_incomplete`, `ConflictReason.profile_mismatch`, `.dock_without_load_type` and `.dock_needs_resource`, and `StoryId.ON_01` to `ON_03`. Three sets exist since 00: `GuardKind` (the guard `kind` of `kernel/describe.ts`, gaining `active_tenant`), `ScopeParty` (the scope `party`) and `PolicyCommand` (the policy command of `db/rls.ts`). SQL below (DDL, checks, the precheck) is written as plain SQL for reading; Drizzle code builds it with `oneOf(..., values(Set))` and set members.
- **Master data today.** `createSite` (`core/sites/sites.ts`) inserts the site, calls `seedLoadTypes` and `syncHolidays`, and writes no hours, so a new site has zero capacity. `createDock` (`core/sites/docks.ts`) inserts the dock and puts it in no resource. Docks enter resources only through `booking/capacity/resources.ts`: `createResource` and `putResourceDocks` answer 409 `dock_in_resource` for a dock held elsewhere, and `bookDock` (`PUT /capacity/docks/:dockId/booking`) moves one dock to `none`, `single` or a pool. There is no delete route for sites, halls or docks.
- **Profiles.** `dock` already has `door_type`, `temperature_zone` and `adr_allowed` (not null). `bookable_resource` has none of them, so a pool can mix a frozen door with ambient ones.
- **Data shape.** No production database exists. Dev databases come from `pnpm db:seed`, and test and e2e databases are migrated from empty. Every seeded dock is `dock_leveler`, `ambient`, no ADR: `seed/sites.ts` (Hamburg DC T01 to T08, Bucharest R1 and R2), `seed/booking.ts` (Lager Hamburg D-01 to D-06) and the test world (`apps/api/test/world.ts`, two docks per site and a dockless pool). No seeded pool mixes profiles, and every seeded dock is in a resource.
- **Migrations.** ADR-0001 allows exactly one generated migration per change and no custom SQL on a branch.
- **Access.** `Access` (`kernel/access.ts`) loads role, permissions, entitlements and settings per request. Guards register metadata (`register` in `kernel/describe.ts`), which the OpenAPI generator (`apps/api/scripts/openapi/document.ts`, `tables.ts`) and the route coverage test read.
- **Web.** `/t/$orgId` renders `AreaHome`, which redirects to the first navigation item. The tenant layout loads `TenantContext` once per org. `useRefreshMasterData` already invalidates the context after master data writes.

## Goals / Non-Goals

**Goals:**
- One rule for "the tenant is ready": the first dock exists. The checklist, the activation write and the gate all use it.
- Pools that the system can create on its own, because the database guarantees that a pool holds docks of one profile.
- No new screen for master data: the checklist only links to the existing ones.

**Non-Goals:**
- Load types that require a dock profile (for example "frozen only"). The profile on the pool makes this possible later; this change does not filter load types by profile.
- Automatic re-splitting or merging of pools, or changing a pool's profile.
- Docks that are not bookable at all (a crane bay outside every resource). Such a dock is set to `inactive` or `maintenance`.
- Suspension (04), billing and downgrade rules (05), and the self-registration flow (02).
- A separate view per hall or dock. 01's ADR-0015 decides that rule; this change keeps the dock dialog and adds "Bookable for" to it.

## Decisions

### 1. The checklist is its own route, `/t/$orgId/onboarding`, reached from the tenant home and a notice

`apps/web/src/routes/t/$orgId/onboarding/index.tsx`, guarded with `guard({ permission: Permission.core.manage_sites })`. `/t/$orgId/index.tsx` gets a tenant-specific component: while `context.status === TenantStatus.onboarding` and the user has `core.manage_sites`, it redirects (`replace`) to the checklist; otherwise it renders `AreaHome` as today. The tenant layout (`t/$orgId/route.tsx`) renders `OnboardingNotice` above the outlet of office screens while the status is `onboarding`; station screens get the same notice in the station header. After activation the route stays reachable and shows every step done, the activation time and "next" links (carriers, public link, staff). ADR-0011's route map gets the row, with "reached from: tenant home while onboarding; onboarding notice".

Alternatives:
- Checklist inside `AreaHome`. Rejected: `AreaHome` serves three areas and only redirects. The checklist would have no URL of its own, and ADR-0011 and 01's rule want one deep-linkable screen per path.
- A nav item `core.onboarding`. Rejected: `navFor` filters by permission and entitlement, not by tenant status. After activation the item would be noise, and hiding it would need a new navigation condition in the module contract.
- A checklist that embeds the site, hall and dock forms. Rejected by the brief: those screens exist, and two copies of a form drift.

### 2. The server computes the steps: `GET /api/t/:orgId/onboarding`

`core/onboarding/routes.tenant.ts`, `requirePermission(Permission.core.manage_sites)`, response `OnboardingView` in `packages/shared/src/modules/core/api.onboarding.ts`:

```ts
// packages/shared/src/modules/core/values.ts
export const OnboardingStep = { site: 'site', hall: 'hall', dock: 'dock' } as const;
export type OnboardingStep = ValueOf<typeof OnboardingStep>;

// packages/shared/src/modules/core/api.onboarding.ts
export interface OnboardingStepState { id: OnboardingStep; done: boolean; siteId: string | null }
export interface OnboardingView { status: TenantStatus; activatedAt: string | null; steps: OnboardingStepState[] }
```

The steps come in the order of `values(OnboardingStep)`. The handler runs three `exists` queries plus one site lookup per step. `siteId` is the first active site for `OnboardingStep.site` and `OnboardingStep.hall`, and the first active site with a hall for `OnboardingStep.dock`. The web joins the hours of the `site` step's site through `capacityQueries.hours`. The query key `['tenant', orgId, 'core', 'onboarding']` is invalidated by `useRefreshMasterData`.

Alternative: derive the steps in the web from the site list plus halls and docks per site. Rejected: one request per site, and the rule would live in two places.

### 3. Activation: a guarded update in the dock transaction, allowed by a narrow RLS policy

`activateTenant(tx, tenantId, now)` in `core/onboarding/onboarding.ts` runs `update org set activated_at = $now where id = $tenant and kind = 'tenant' and activated_at is null`. `createDock` calls it after the dock is placed and checked (decision 8), with `clock.now()`, so `createDock` gains a `Clock` parameter. The trigger is "a dock was inserted", because a dock cannot exist without a hall and a site (`dock.hall_id` and `(hall_id, site_id)` foreign keys). No route deletes a dock, and no code clears the column.

`org` gets one policy in `core/schema.ts`:

```ts
allow(ScopeParty.tenant, PolicyCommand.update,
  sql`${tenantIs(t.id)} and ${t.activatedAt} is null`,      // using: own org, still onboarding
  sql`${tenantIs(t.id)} and ${t.activatedAt} is not null`,  // check: the row leaves onboarding
  'activate'),
```

The tenant party can therefore change its own org row only once, and only into the active state. Activation is one-way in the database, not only in the code. Any other column changed in that same statement would pass, but no tenant route writes `org`.

Alternatives:
- `asScope(tx, PLATFORM, ...)` for the update. Rejected: it hands platform rights to a request handler for one column.
- A security definer function or a trigger on `dock`. Rejected: custom SQL, which ADR-0001 §8 keeps off branches. A trigger also hides a business rule from the service code.
- Activate on "site + hall + dock exist", re-checked on every write. Rejected: the dock insert implies the other two, and a re-check after deactivations would invite reverting.

### 4. Gating: `Access.tenantStatus`, a `requireActiveTenant()` guard, and the error `onboarding_incomplete` (409)

`loadAccess` reads `activated_at` of the scope's tenant for the `tenant` and `carrier_at_tenant` parties. Both can already select that org row. It exposes `tenantStatus: TenantStatus | null`, computed with `tenantStatus({ activatedAt })`. `requireActiveTenant()` in `kernel/access.ts` throws `new ApiError(ErrorCode.onboarding_incomplete)` unless the status is `TenantStatus.active`. It registers the guard `{ kind: GuardKind.active_tenant }`. Routes put it after `requirePermission` and `requireEntitlement`, so 403 still wins. It goes on:

| Route | Router |
|---|---|
| `POST /api/t/:orgId/carriers/invitations` | `booking/carriers/routes.tenant.ts` |
| `POST /api/t/:orgId/carriers/public-links` and `.../:siteId/regenerate` | `booking/carriers/routes.tenant.ts` |
| `POST /api/t/:orgId/bookings` | `booking/staff/routes.tenant.ts` |
| `POST /api/t/:orgId/yard/walk-ins` | `yard/routes.tenant.ts` |
| `POST /api/c/:orgId/at/:tenantId/bookings` | `booking/portal/routes.carrier-at-tenant.ts` |

`ErrorCode` (`packages/shared/src/values/errors.ts`) gains `onboarding_incomplete`, and `ERROR_STATUS` (`satisfies Record<ErrorCode, number>`) maps it to 409, with the default message "Finish onboarding first: add a site, a hall and a dock". The catalog `core/errors.json` gets the text in de, en and pl.

The public link routes (`/api/public/links/:slug...`) are not gated. A slug can only be created through the gated tenant route, and activation never reverts, so no slug of a tenant in onboarding can exist. The same reasoning covers reschedule, cancel and avis routes: no booking can exist before activation.

Why 409 and a new code: 403 `forbidden` and `entitlement_required` mean "not your role" and "not your package". This state is temporary and the tenant resolves it itself, like the other 409 state conflicts. A code of its own, rather than `conflict` with a reason, fits a rule that applies across modules. The guard metadata can then name it, and the UI maps it to one text.

Guard metadata: `apps/api/scripts/openapi/document.ts` writes `x-requires-active-tenant: true` and lists 409. `tables.ts` adds "active tenant" to the entitlement column. `RouteCase` gains an optional `onboarding?: OnboardingCase`, set to `OnboardingCase.blocked`. `checkRouteCase` runs, for such a case, the control request once more after setting world A's tenant back to onboarding as the owner, and expects 409 `onboarding_incomplete`. `route-coverage.test.ts` fails when a route's registered guards and its case disagree about the onboarding check, as it does for undeclared entitlements.

The web reads `status` from `TenantContext` (`core/context/routes.tenant.ts`). A hook `useTenantStatus()` next to `useAccess()` in `apps/web/src/lib/access.ts` returns it. `OnboardingGate` (in `apps/web/src/modules/core/onboarding.tsx`) wraps a gated action: it disables the action and shows the reason as text with a `LockIcon`, like the existing "pools off" note in `resource-editor.tsx`. Disabled buttons get no hover or focus, so the reason is not a tooltip.

### 5. Dock profile on resources and memberships, held by composite foreign keys

`booking/schema.resources.ts`:

- `bookable_resource`: `door_type text not null default 'dock_leveler'`, `temperature_zone text not null default 'ambient'`, `adr_allowed boolean not null default false` (Drizzle defaults `DoorType.dock_leveler` and `TemperatureZone.ambient`; checks `oneOf` against `values(DoorType)` and `values(TemperatureZone)`). `hall_id uuid null`, with FK `(hall_id, site_id) → hall(id, site_id)` and check `hall_id is null or kind = 'pool'`. Unique `bookable_resource_id_profile_key (id, door_type, temperature_zone, adr_allowed)`. Partial unique index `bookable_resource_default_pool_key (hall_id, door_type, temperature_zone, adr_allowed) where hall_id is not null`.
- `resource_dock`: the same three columns with the same defaults. FK `(dock_id, door_type, temperature_zone, adr_allowed) → dock(id, door_type, temperature_zone, adr_allowed)` and FK `(resource_id, door_type, temperature_zone, adr_allowed) → bookable_resource(id, …)`, both `on update no action`. The existing FKs on `(resource_id, resource_kind)` (cascade) and `(dock_id, site_id)` stay.
- `dock` (`core/schema.ts`): unique `dock_id_profile_key (id, door_type, temperature_zone, adr_allowed)`.

The defaults exist so that the generated migration can add the columns to non-empty tables (see Migration Plan). Code never relies on them. Every writer takes a `DockProfile` (`Pick<DockRow, 'doorType' | 'temperatureZone' | 'adrAllowed'>`) from the dock row, and the composite FKs reject a wrong value. A 23503 on one of the two profile FKs maps to 409 `conflict` with `ConflictReason.profile_mismatch`, as a backstop for concurrent edits. The checks in decision 7 catch the normal case first.

`ResourceView` gains `doorType`, `temperatureZone`, `adrAllowed`, `hallId` (non-null marks the default pool of that hall) and `loadTypeIds`. RLS on both tables is unchanged.

Alternatives (from the research in the brief):
- Load types per dock, as Opendock (`Dock.loadTypeIds`; an appointment requires a `dockId`, live spec https://neutron.opendock.com/docs-json) and GoRamp do. Rejected: those systems book an exact door. rampflow books a pool and assigns the door on arrival, like SAP Dock Appointment Scheduling's loading point, "a group of docks with similar characteristics" (https://help.sap.com/saphelp_ewm94/helpdata/en/fe/7579723f4c4a5aa8e3b9b871275549/content.htm). Per-dock load types would break ADR-0004's counting of interchangeable docks in a pool. Oracle OTM puts its rules on a door or a door group, which is the same choice as ours.
- Homogeneity checked only in the service. Rejected: the dock form, the pool editor, `bookDock` and the dock-create path all write memberships. A missed path would mix a reefer door into an ambient pool, and capacity would offer it for any load.
- A taxonomy beyond the three columns. Rejected: no standard exists (DIN EN 1398 covers dock levellers only, EN 1570 lift tables). The columns already drive real filtering: MPREIS (2025) groups ramps by goods area, and IBM Sterling restricts reefer trucks to specific docks.

### 6. Default pools: one per hall and profile, created on demand

`placeDock(tx, req, dock, origin)` in a new `booking/capacity/placement.ts`:

1. `booking.pools` off: create a single resource for the dock (named by its code, both directions, the dock's profile, `sort = max + 1` on the site). Link it to the load types of `origin` (the resource the dock left), or to every load type of the site for a new dock.
2. `booking.pools` on: `insert … on conflict (hall_id, door_type, temperature_zone, adr_allowed) where hall_id is not null do nothing`, then select the pool. Two concurrent first docks of one hall therefore end in one pool: under read committed, the second insert waits for the first commit, does nothing, and its next select sees the row. A pool created here is linked to every load type of the site. A found pool without an active load type is linked to them too, so a new dock never fails on a pool the admin emptied of load types.
3. Insert the `resource_dock` row with the dock's profile.

The name is the hall name plus ` · <label>` for each attribute that differs from `DoorType.dock_leveler`, `TemperatureZone.ambient`, no ADR, in the order zone, door type, ADR. Labels come from `core:sites.zones`, `core:sites.door_types` and the literal "ADR", translated with `createServerI18n(site.defaultLocale)` from `@rampflow/i18n/server`, as in the safety register's CSV. The name is cut to 80 characters. Examples: "Halle 1", "Halle 2 · Tiefkühl", "Hall A · Ground level · ADR". The admin may rename a default pool. It stays the default pool, because that status is `hall_id`, not the name.

A default pool only takes docks of its hall: `bookDock`, `createResource` and `putResourceDocks` answer 422 at `resourceId` or `dockIds[i]` otherwise. Manual pools (`hall_id` null) may span halls of the site.

Alternative: one default pool per hall regardless of profile, as the product owner's decision 7 first put it ("all docks of a hall form one pool"). Rejected by the binding research decision that refines it: a hall with one frozen door would offer that door's capacity to every load type of the pool.

### 7. Pool membership moves docks, and every dock always has a resource

The old rules assumed free docks: `ConflictReason.dock_in_resource` on create, and the `none` variant of `DockBooking`. With every dock always in a resource, a new pool could never get a dock. The new rules:

- `DockBooking` loses its `none` variant (**BREAKING**). The "Booked as" select (`modules/capacity/booked-as.tsx`) loses "Not bookable".
- `createResource`: all docks must share one profile (409 `ConflictReason.profile_mismatch` naming the docks that differ from the first). The pool takes that profile. Each dock moves out of its current resource; an emptied single is deactivated, as `bookDock` does today. The new resource is linked to the union of the load types of the resources the docks left.
- `putResourceDocks`: docks added move in after the profile check. Docks removed go back through `placeDock` to their default pool. If the edited pool *is* that default pool, the answer is 409 `conflict` with `ConflictReason.dock_needs_resource` and the `dockIds`.
- `bookDock`: `single` and `pool` work as today, plus the profile and hall checks. `singleFor` reuses a dockless single only after setting it to the dock's profile, which the FK allows because no membership references it.
- `ConflictReason.dock_in_resource` stays only for the race the primary key catches (two moves of one dock).

`updateDock` handles the profile and the hall in one transaction. If the profile changes, it deletes the membership, updates the dock, then either updates the single resource's profile or calls `placeDock` (pool, needs `Feature.booking.pools`, else 403 `ErrorCode.entitlement_required`). If only the hall changes and the dock is in a default pool, it moves to the default pool of the new hall. A dock that has no resource (legacy data) is placed on its next update.

### 8. "Bookable for at least one load type" is checked per write, on the resources the write touched

`assertBookable(tx, tenantId, resourceIds)` in `placement.ts` selects the given resources that have at least one dock and no linked active load type. If any are found, it throws 409 `conflict` with `ConflictReason.dock_without_load_type` and their `dockIds`. It runs at the end of `createDock`, `updateDock`, `bookDock`, `createResource` and `putResourceDocks` (the target resources), `putLoadTypeResources` (the resources removed from the load type), and `updateLoadType` with `active: false` (its resources). The scoped check lets a site with legacy unplaced docks still be repaired dock by dock. A site-wide check would block every write until all were fixed.

Concurrency: under read committed, two writes can each see the other's load type as still active. For example, two requests deactivate the last two active load types of one resource. Both checks pass, and the resource ends with none. Every write path above therefore first calls `lockSiteCapacity(tx, siteId)` (`capacity/lock.ts`), the per-site advisory lock that booking creation and transitions already take. It does this before it reads or changes anything. Load types, resources and docks all belong to one site, so the lock serializes every write that can affect the invariant. A booking waits only for the duration of a master data write, which is rare and short. A separate lock key was rejected: it would need a fixed lock order against the capacity lock in `bookDock`-like paths that run during bookings, and it gains nothing.

Active load types only: an inactive type offers nothing, so a dock whose resource has only inactive types is not bookable. The invariant cannot be one CHECK, because it spans three tables. `placement.test.ts` builds a site through the services, runs every write path in turn, and asserts after each that the global query "docks without resource, or in a resource without an active load type" returns nothing.

The dock dialog (`modules/capacity/halls.tsx`) shows "Bookable for": the resource name (or "Single dock") and the active load type names from `ResourceView.loadTypeIds` joined with `capacityQueries.loadTypes`, with a link to the load types tab. The docks tab loads load types when the user has `booking.view`. When the form's profile differs from the saved one and the dock is pooled, the dialog shows "Saving moves this dock to the pool for its new profile".

### 9. Site hours at creation: rows in the API, templates in shared constants

`CreateSite` gains `hours: WeeklyHours.min(1)`. `WeeklyHours` and `HoursRow` (opens before closes, `24:00` allowed, at most 70 rows, no overlap on a day) move from `booking/api.capacity.ts` to `packages/shared/src/time/weekly-hours.ts`. `WeeklyHours` accepts an empty list, because `PutHours` uses `rows: []` to drop a resource's own hours and fall back to the site's; only `CreateSite` adds `.min(1)`. `PutHours` and `CreateSite` both import them, so the rules cannot diverge, and core no longer depends on a booking schema. `createSite` inserts the rows with `resource_id` null in its transaction, the same insert `putHours` does. `UpdateSite` does not take hours.

The template choice is a value set in `packages/shared/src/modules/core/values.ts`, and the rows per preset are a record in `api.sites.ts` keyed by its subset:

```ts
// packages/shared/src/modules/core/values.ts
export const HoursTemplate = { one_shift: 'one_shift', two_shifts: 'two_shifts', custom: 'custom' } as const;
export type HoursTemplate = ValueOf<typeof HoursTemplate>;
export const PresetHoursTemplate = {
  one_shift: HoursTemplate.one_shift,
  two_shifts: HoursTemplate.two_shifts,
} as const;
export type PresetHoursTemplate = ValueOf<typeof PresetHoursTemplate>;

// packages/shared/src/modules/core/api.sites.ts
export const hoursTemplateRows = {
  one_shift: weekdays(1, 5, '06:00', '14:00'),
  two_shifts: weekdays(1, 5, '06:00', '22:00'),
} as const satisfies Record<PresetHoursTemplate, HoursRow[]>;
```

The site form (`modules/capacity/site-form.tsx`, create mode only) gets an "Opening hours" `FieldSet` with a `RadioGroup` (one shift preselected, two shifts, custom) and a read-only preview of the rows. "Custom" copies the current rows into an editable week. The week editor is extracted from `HoursEditor` in `hours.tsx` into `WeekWindowsField` (a `useFieldArray` over `rows`), which both forms use. The form's zod schema is `CreateSite` through `zodResolver`.

Alternative: send a template id and let the server expand it. Rejected: the server would encode UI choices, and "custom" needs rows anyway.

Research basis (brief): there is no industry default for hours (Munich Airport Monday to Friday 06 to 14, Knick Monday to Friday 7 to 16, MPREIS with a lunch break and a night window). The admin therefore confirms a prefilled template.

### 10. ADRs

- **ADR-0017 Homogeneous pools and the dock profile** (new, amends ADR-0004). It records decisions 5 to 8: profile columns and composite FKs, default pools per (hall, profile), membership moves, "every dock in exactly one resource with an active load type", the research citations, and the rejected alternatives.
- **ADR-0004.** The status line names ADR-0017. "Data" lists the new columns and keys. "Pools and the `booking.pools` entitlement" says new docks become singles while pools are off. The 409 `dock_in_resource` text narrows to the race.
- **ADR-0011.** A route map row for `/t/$orgId/onboarding`. The tenant home redirect while onboarding. `?new=1` on `/t/$orgId/sites`.
- The onboarding gate is a cross-module rule other units must follow when they add carrier-facing or booking-creating routes. It goes into `module-contract.md` ("Middleware", route case field). It needs no ADR of its own.

## Risks / Trade-offs

- [A dev database with a pooled dock of a non-standard profile fails the migration] → no such database comes from the seed or the tests. Task 2.1 runs a precheck query first. The remedy is `pnpm db:reset && pnpm db:seed`.
- [The column defaults let a future writer omit the profile] → every writer goes through `placement.ts` or takes a `DockProfile`. The composite FKs reject a wrong profile on any membership, so a silent default can only land on a dockless resource.
- [Removing `{ as: 'none' }` and changing `dock_in_resource` breaks API clients] → the only clients are the web app and the e2e tests, changed in this change. `api-routes.md` and the OpenAPI document state the new semantics.
- [Profile and hall changes move docks the admin did not touch in the pool editor] → the dock dialog says so before saving. The move uses the same default pool rule as a new dock.
- [Blocking the last load type's removal surprises an admin editing load types] → the 409 names the docks, and `core:errors.conflict.dock_without_load_type` says to link another load type first.
- [`createDock` now writes into the booking module's tables under `core.manage_sites`] → `createSite` already does this (`seedLoadTypes`). The resource tables' RLS is tenant-wide, and the tenant admin, who holds `core.manage_sites`, also holds `booking.manage_resources`.
- [The tenant `update` policy on `org` lets the tenant party change other columns in the activation statement] → only `activateTenant` issues an update on `org` under the tenant party. The `using` clause makes the policy dead after activation.
- [The extra `org` read per request] → one primary key lookup, in the same round trip as the subscription read.

## Migration Plan

1. One generated migration, `pnpm db:generate --name 03-tenant-onboarding`. It adds the profile columns with defaults, `hall_id`, the unique keys, the default pool index, the composite FKs and the `org` policy. There is no custom SQL.
2. Existing rows get the standard profile. On every seeded or test database, all pooled docks have that profile, so the FKs validate. Existing pools keep their docks, load types, hours, closures and bookings. They get `hall_id` null, so they count as manual pools. The first new dock in such a hall creates the hall's default pool. Mixed-profile pools exist in no known database, so the migration splits nothing. A database that has one fails on `resource_dock`'s dock profile FK, inside the migration transaction, and is reset.
3. Precheck for a dev database before migrating:
   ```sql
   select s.name, d.code from resource_dock rd join dock d on d.id = rd.dock_id join site s on s.id = d.site_id
   where (d.door_type, d.temperature_zone, d.adr_allowed) <> ('dock_leveler', 'ambient', false);
   ```
4. Rollback: drop the migration's columns, keys and policy. No data moves out of existing columns.

## Seed data

- **Acme Logistics (active).** `seed/sites.ts` now passes `hours` to `createSite`: Hamburg DC uses custom hours (Monday to Friday 06:00 to 22:00, Saturday 06:00 to 14:00), Bucharest passes custom hours Monday to Friday 07:00 to 19:00. `createDock` puts the docks into default pools. The seed then reaches the old layout through the services, so it exercises the manual split:
  - Hamburg DC: it renames the default pool "Halle 1" to "Wareneingang" with direction inbound and books T05 as single. It renames "Halle 2" to "Versand" with direction outbound and books T08 as single. It creates the outbound load type before narrowing the inbound ones, because a pool never loses its last load type.
  - New dock **T09** in Halle 2: frozen, dock leveler, no ADR. It lands in its own default pool "Halle 2 · Tiefkühl" with the site's load types. This shows the profile rule and "Bookable for" in `pnpm dev`.
  - Bucharest: it renames the default pool "Hall A" to "Ramps".
  - On an existing database, the seed skips the existing sites as before but ensures T09 by `(site, code)`, so a migrated dev database also shows a second profile.
  - Acme is already active when this seed runs: 02's `seed/core.ts` sets its `activated_at` to `created_at`. `activateTenant` therefore changes nothing for Acme, and its activation time stays the creation time.
- **Lager Hamburg (`seed/booking.ts`).** Its direct insert of "Rampen 1–6" sets `hall_id` to Halle 1 and the standard profile, making it the hall's default pool. The `resource_dock` rows carry the profile.
- **Nordhafen Kühllogistik GmbH (onboarding, from 02).** 02's `seed/signups.ts` (registered right after `core`) creates three tenants in onboarding without sites: Nordhafen Kühllogistik GmbH (`admin@nordhafen.local`), Acme Logistik Süd GmbH (`admin@acme-sued.local`) and Wisła Magazyny Sp. z o.o. (`admin@wisla-magazyny.local`). `seed/sites.ts` gives Nordhafen a partly finished onboarding and leaves the other two empty. Through `createSite` with the one-shift template, it adds the site "Bremerhaven" (Am Seedeich 40, 27572 Bremerhaven, DE, DE-HB, Europe/Berlin, `de`). Through `createHall` it adds the hall "Halle 1". It adds no dock.
  - Signing in as `admin@nordhafen.local` shows the checklist with "Create a site" and "Add a hall" done, the site's hours Monday to Friday 06:00 to 14:00, and "Add a dock" open with a link to the Bremerhaven page. It also shows the onboarding notice and a disabled "Invite carrier".
  - Signing in as `admin@acme-sued.local` or `admin@wisla-magazyny.local` shows the checklist with every step open.
  - The seed finds Nordhafen by org name (kind `tenant`), the site by `(tenant, name)`, and the hall by `(site, name)`. It never adds a dock, so Nordhafen stays in onboarding across runs. If 02's seed did not run and Nordhafen is missing, the step logs that and skips.
- `docs/how-to/run-locally.md`: the Nordhafen row that 02 adds now says what the account shows in 03 (site and hall done, dock open). No new account.

## Open Questions

- Whether the onboarding checklist should later show optional steps (logo, staff, load types) before activation. The default is no: they appear as "next" links once the tenant is active. Adding steps does not change the activation rule.
- The default pool's name is fixed at creation in the site's default locale. Whether a later change of the site locale should rename untouched default pools: default no.
