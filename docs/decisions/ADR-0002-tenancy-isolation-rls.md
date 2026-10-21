---
title: ADR-0002 Tenancy isolation with application scoping and row-level security
description: How every request runs in one scoped transaction as a NOBYPASSRLS role, which parties exist (anonymous, user, platform, tenant, carrier, carrier at tenant, driver, token, public, system), and how CI proves no route leaks across tenants.
type: explanation
audience: [agent, developer]
tags: [adr, tenancy, security, rls, postgres, testing]
status: stable
updated: 2026-10-21
related: [docs/decisions/ADR-0016-tenant-self-registration.md, docs/explanation/mvp-scope.md, docs/explanation/research/tech-architecture.md, docs/reference/data-model.md, docs/decisions/ADR-0004-booking-capacity-concurrency.md]
---

# ADR-0002: Tenancy isolation with application scoping and row-level security

Status: accepted, 2026-10-19.

## Context

The scope requires application scoping plus Postgres RLS, with the API connected as a `NOBYPASSRLS` role that owns no table. CI must call every route as another tenant, carrier and driver booking and expect 404 or an empty result.

One booking is visible through four paths: its tenant's staff, its carrier's users, its driver's token, and gate operators restricted to some sites. Each path is a filter somebody can forget. Some flows also cross the paths. A carrier booking must count every other carrier's bookings on the same resource to check capacity, without seeing them.

## Options considered

| Option | For | Against |
|---|---|---|
| Application scoping only | Simple. Fast to write. | One forgotten `where` leaks another tenant's drivers' names and plates. Nothing catches it below the API. |
| RLS only, no `where` in code | One source of truth in the database. | Queries read as unscoped, so reviewers cannot see intent. The planner still needs the predicate for indexes. |
| Schema or database per tenant | Hard isolation. | Carriers span tenants, so cross-tenant carrier lists become fan-out queries. Migrations run N times. Overkill at 20 tenants. |
| **App scoping plus RLS as a backstop** | Readable, indexed queries; a forgotten filter returns zero rows instead of foreign rows. | Every table needs policies, and every request needs a transaction that sets the scope. Both are mechanical and generated. |

## Decision

Use shared tables with explicit `tenant_id` and `carrier_id` columns, filter in every query, and enable RLS on every table that holds tenant, carrier or personal data.

Revised 2026-10-19 during U1 after the design review: every policy tests the party; `asScope` switches scope inside one transaction; a carrier at a tenant reads only its own bookings; the driver locks its booking and appends events; `app_user` has RLS; overrides are readable only by the tenant and the platform.

### Roles

- `rampflow_app` is `LOGIN NOBYPASSRLS` and owns no table. The API and the job runner connect only as this role. The API refuses to start when its role is a superuser or has `rolbypassrls`.
- The owner role runs migrations ([ADR-0001](ADR-0001-data-access-drizzle-node-postgres.md)). Tables do not use `FORCE ROW LEVEL SECURITY`, because the app role is not the owner and the owner must be able to run data migrations. Tests seed fixtures as the owner and assert as `rampflow_app`.

### Scope and session variables

Every database access runs inside `withScope(scope, fn)` (`apps/api/src/db/scope.ts`). It opens a transaction and sets transaction-local variables with `set_config(name, value, true)`, so pooled connections never carry a scope into the next transaction.

```ts
export type Scope =
  | { party: 'anonymous' }                                     // sign-in, magic-link and reset requests
  | { party: 'user'; userId: UserId }                          // signed in, no org chosen: /api/me
  | { party: 'platform'; userId: UserId }
  | { party: 'tenant'; tenantId: TenantId; siteIds: readonly SiteId[] | 'all'; actor: TenantActor }
  | { party: 'carrier'; carrierId: CarrierId; userId: UserId; role: CarrierRole }
  | { party: 'carrier_at_tenant'; carrierId: CarrierId; tenantId: TenantId; userId: UserId; role: CarrierRole }
  | { party: 'driver'; tenantId: TenantId; bookingId: BookingId; channel: 'link' | 'staff' }
  | { party: 'token'; tokenHash: TokenHash; userId: UserId | null } // emailed token; userId when a signed-in user accepts
  | { party: 'public'; tenantId: TenantId; siteId: SiteId | null } // public booking link visitor or logo request
  | { party: 'system'; job: JobName };                         // cross-tenant job steps only

export type TenantActor =
  | { kind: 'user'; userId: UserId; role: TenantRole }
  | { kind: 'system'; job: JobName };                          // jobs, token redemption, capacity reads

export function withScope<T>(scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T>;
export function asScope<T>(tx: Tx, scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T>;
```

- `sessionVariables(scope)` is a pure function from the scope to `app.party`, `app.user_id`, `app.tenant_id`, `app.carrier_id`, `app.site_ids` (`*` for all sites), `app.booking_id` and `app.token_hash` (hex). Unset variables are `''`.
- **One scoped transaction per request.** `withScope` throws when called inside another scoped transaction (tracked with `AsyncLocalStorage`): a nested one would take a second pool connection while the first waits, and its commit would survive the outer rollback. The pool has `connectionTimeoutMillis: 5000`, so exhaustion fails loudly instead of hanging.
- **`asScope(tx, scope, fn)`** re-issues `set_config` for `scope` inside the same transaction, runs `fn`, and restores the previous variables. RLS reads the variables per statement and row locks persist, so a switch is atomic with the rest of the request. Biome allows it only in `kernel/`, `modules/*/jobs/`, `*.redeem.ts`, `modules/booking/capacity/` and `modules/core/platform/usage.ts`.

The baseline migration defines one SQL accessor per variable in schema `app`: `app.party()`, `app.user_id()`, `app.tenant_id()`, `app.carrier_id()`, `app.booking_id()`, `app.token_hash()`. Each reads `nullif(current_setting('app.x', true), '')`, so a variable reset to `''` on a pooled connection reads as NULL and every comparison with it fails closed. Two predicates and two definer helpers complete the set:

```sql
create function app.site_allowed(site uuid) returns boolean language sql stable as $$
  select case when current_setting('app.site_ids', true) = '*' then true
         else site = any (string_to_array(nullif(current_setting('app.site_ids', true), ''), ',')::uuid[])
         end $$;

create function app.linked_tenant(tenant uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.tenant_carrier_link l
                 where l.tenant_id = tenant and l.carrier_id = app.carrier_id()) $$;
```

- `app.site_allowed` uses `case`, because `or` does not short-circuit: `'*'::uuid[]` would throw for a scope with all sites. The party matrix test found this.
- `app.linked_tenant` reads under the caller's policies. The baseline creates it with `check_function_bodies = off`, so policies in the generated migration can call it before `tenant_carrier_link` exists.
- `app.shares_org(user)` (security definer, `search_path` pinned) answers whether a user is a member of the scope's tenant or carrier, or, for a tenant, of a linked carrier. The `app_user` policies use it, because the caller's own membership policy hides other orgs' memberships.
- `app.user_by_email(address)` (security definer) returns `id`, `password_hash`, `email_verified_at`, `disabled_at` and `locale` for the `anonymous`, `token` and `public` parties only. Sign-in, magic-link, reset and registration requests use it before anyone is signed in. Change 02 added `locale` in the custom migration `0008_02-tenant-self-registration-backfill.sql`, so the known-account email of a registration uses the account's language.

Policies call the accessors as `(select app.tenant_id())`, so the planner evaluates them once per statement.

### One transaction per request

A Hono middleware resolves the scope, then runs the rest of the request inside `withScope`:

```ts
// apps/api/src/kernel/scoped.ts
export const scoped = (resolve: (c: Context<AppEnv>) => Promise<Scope>) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const scope = await resolve(c);            // 401 without session, 404 for a foreign org
    await withScope(scope, async (tx) => {
      c.set('scope', scope);
      c.set('db', tx);
      c.set('access', await loadAccess(tx, scope, c.var.clock));
      await next();
      if (c.error || c.res.status >= 400) throw ROLLBACK; // a 409 after a partial write commits nothing
    }).catch((e) => { if (e !== ROLLBACK) throw e; });
  });
```

- Handlers use `c.var.db` and never import the pool. A Biome `noRestrictedImports` rule allows `apps/api/src/db/pool.ts` only inside `db/`, `kernel/`, `app.ts`, `server.ts`, `scripts/` and `test/`.
- Handlers raise domain errors with `throw new ApiError(...)`. The rollback rule also covers a handler that returns an error response.
- Scope resolution runs before the request transaction, in its own short transaction: the session lookup as `anonymous` (then `user` for the `app_user` row), the membership lookup as `user`, the carrier link as `carrier`, the driver cookie as `token`.
- `carrierScope` serves the whole `/c/:orgId` area. For paths under `/c/:orgId/at/:tenantId` it parses the tenant id from the path (a mount-level middleware cannot read a deeper route parameter) and returns `carrier_at_tenant` when a link exists, else 404.
- **Writes that must survive a rollback.** Rate-limit events commit on their own pool connection, never through `c.var.db` ([ADR-0003](ADR-0003-authentication-self-built-sessions.md)), because a failed sign-in answers 401 and must still count. Nothing else is exempt.

### How each context works

| Party | Entered by | Sees | Writes |
|---|---|---|---|
| `anonymous` | `/api/auth/*` before a session exists, and `POST /api/public/signups` | Platform setting rows; users only through `app.user_by_email()` | Outbox rows without a tenant (magic links, resets, registration emails) |
| `user` | Any signed-in request without an org: `/api/me`, invitation acceptance by a signed-in user | Own `app_user` row, own memberships and their orgs, platform setting rows | Own profile; a new carrier org during acceptance |
| `platform` | `/api/platform/*` for `platform_admin` members of the platform org | All orgs, users, memberships, subscriptions, overrides, platform settings, invitations | The same. It has no policy on operational tenant tables. |
| `tenant` | `/api/t/:orgId/*` after the server finds the caller's membership in `:orgId`. Gate and dock operators carry their site list; one without `membership_site` rows sees all sites. | Rows with `tenant_id = app.tenant_id()`; site-scoped tables also require `app.site_allowed(site_id)`. Users of the tenant and of its linked carriers. | Same rows. |
| `carrier` | `/api/c/:orgId/*` after the membership check | Own bookings, avis, events and driver links at every tenant (`carrier_id = app.carrier_id()`); reference data (sites, halls, docks, resources, load types, logo, settings, subscription) of linked tenants, including deactivated links so old bookings stay readable; own org's users | Own org's users and invitations |
| `carrier_at_tenant` | `/api/c/:orgId/at/:tenantId/*` after the carrier's link to the tenant is found; it must be active for create and reschedule | Reference data of that tenant (including hours, closures and resource membership); its **own** bookings and children there | Bookings, avis, events and driver links with `carrier_id = app.carrier_id()` and `tenant_id = app.tenant_id()`; outbox rows |
| `driver` | `/api/driver/*` after the `rf_driver` cookie resolves to an unrevoked, unexpired `driver_access` row | The one booking (`id = app.booking_id()`), its events and driver links, the tenant's reference data, published safety content, and its own acknowledgements, links and attempts. Not `avis`: it holds the visit's personal data. | `booking_event` rows of its booking (`safety_linked`), safety acknowledgements and their link to this booking, attempts, passes; locks its booking for `transitionBooking` |
| `token` | Invitation, carrier invitation, carrier registration, tenant registration (`/api/public/signups/inspect` and `/verify`) and driver token exchange, before or while the holder signs in | Only the rows whose `token_hash = app.token_hash()`; the accepting user's own row | Marks that row used; creates a user or a carrier org on acceptance; on tenant registration an onboarding tenant org (`kind = 'tenant' and activated_at is null`) and its `start` subscription (`package = 'start'`) |
| `public` | `/api/public/links/:slug` after the slug lookup, and `/api/public/logos/:tenantId/:sha` | That tenant's org, sites, logo, subscription and settings | Carrier registrations and users for that tenant |
| `system` | Job runner steps that span tenants | `org` (to list tenants), `outbox_message`, platform setting rows | `outbox_message` |

Rules that follow from the table:

- **Every policy names its party.** All parties connect as `rampflow_app`, and permissive policies of one table combine with `or`. `driver`, `carrier_at_tenant` and `public` scopes set `app.tenant_id` on purpose, so a bare `tenant_id = app.tenant_id()` policy would hand them every tenant-private row. `apps/api/src/db/rls.ts` therefore emits every predicate as `(select app.party()) = '<party>' and <predicate>`, one policy per party and command.
- **A carrier at a tenant reads only its own bookings.** Slot, resource and company of another carrier's booking are that carrier's delivery schedule. The capacity read of [ADR-0004](ADR-0004-booking-capacity-concurrency.md) switches with `asScope` to a tenant scope with actor `system:capacity` and selects only `resource_id`, `starts_at` and `blocks_until`.
- **Locks need UPDATE policies.** `select ... for update` passes only rows that an UPDATE policy's `using` admits. The driver gets a lock-only policy on its booking (`using id = app.booking_id()`, `with check false`), so `transitionBooking`'s row lock works for `link_acknowledgement` without granting real updates. Capacity uses an advisory lock per site, which needs no policy.
- **RETURNING and ON CONFLICT need SELECT.** A party without a SELECT policy on a table inserts without `.returning()` and generates ids in the application. `enqueueEmail` inserts with `on conflict do nothing` without a conflict target, which needs no SELECT policy.
- **Overrides stay internal.** Only the tenant and the platform read `entitlement_override` (its `note` is the platform's reason). For a carrier at a tenant, a driver or a public visitor, `loadAccess` resolves the tenant's entitlements through `asScope` with actor `system:access`.
- **Platform admins do not read tenant operations.** PL-04 usage counts switch per tenant with `asScope` to a `tenant` scope with actor `system:usage` and return counts only.
- **Jobs work per tenant.** A tick runs in one transaction that holds the job lock ([ADR-0010](ADR-0010-email-outbox-job-runner.md)). `forEachTenant` lists tenants under `system`, then runs each tenant in a savepoint under `asScope` with a tenant scope and a system actor. RLS confines each step to one tenant, and one tenant's failure rolls back only its savepoint.
- **Token redemption is one transaction.** The handler claims the token under `token` with one statement, then switches with `asScope` to write the membership or carrier link under `tenant` with actor `system:invitation`, and commits once. A failed membership insert therefore leaves the token unused. The claim is always a single statement, never a select followed by an update:

  ```sql
  update invitation set accepted_at = $now, accepted_user_id = $user
  where token_hash = $hash and accepted_at is null and revoked_at is null and expires_at > $now
  returning id, org_id, org_kind, role, site_ids
  ```

  Under read committed, a select-then-update lets two concurrent exchanges both succeed; the guarded update lets exactly one return a row. `auth_token`, `carrier_invitation`, `driver_access` and `tenant_signup` claims use the same shape. A tenant registration ([ADR-0016](ADR-0016-tenant-self-registration.md)) writes the org, the subscription and the user under `token`, and only the `tenant_admin` membership under `asScope` as the new tenant with actor `system:signup`. This resolves the earlier contradiction with ADR-0003, which required the token to be marked used in the transaction that creates the session or membership.
- **The duplicate check reads as the platform.** `core/signup/duplicates.redeem.ts` switches with `asScope` to `platformSystemScope` (`kernel/system.ts`, the platform party with the nil user id, also used by the retention job) to look for another tenant with the same tax id or company email domain, and returns only a boolean to the token holder. Granting `system` a read on `membership` and `app_user` instead would let every job read every user.
- **System actors are rare by construction.** `systemActor()` and `systemScope()` live in `apps/api/src/kernel/system.ts`. A Biome override allows importing them, and `asScope`, only from the paths named above.

### Tables without RLS

`session`, `auth_token` and `rate_limit_event` hold no tenant data and are reachable only from `apps/api/src/modules/core/auth/` and `kernel/`. `job_run` holds counts only and is written by `kernel/jobs.ts`. `public_link` maps a slug to a tenant and site and is read only by `modules/booking/`. `tenant_signup` holds a registration before any tenant or account exists, so no party owns it; it is reachable only from `modules/core/signup/` and `privacy/jobs/retention.ts` ([ADR-0016](ADR-0016-tenant-self-registration.md)). A Biome rule restricts imports of these schema objects to those directories. `app_user` has RLS (see the table above); modules read names and emails through `userDisplay(tx, ids)` in `kernel/users.ts`.

### Policies are generated

`apps/api/src/db/rls.ts` builds `pgPolicy` arrays, so a new table gets the same policies as its siblings:

```ts
export function allow(party: Party, command: 'all' | 'select' | 'insert' | 'update' | 'delete', using: SQL, check?: SQL): PgPolicy;
export function lockOnly(party: Party, using: SQL): PgPolicy;          // update with check false
export function tenantPolicies(t: { tenantId }, o: {
  site: AnyPgColumn | null;                                            // site-scoped on this column
  readers: readonly ('carrier' | 'carrier_at_tenant' | 'driver' | 'public')[];
}): PgPolicy[];
export function carrierOwnedPolicies(t: { tenantId; carrierId; siteId; bookingId }, o: {
  update: boolean;                                                     // false for append-only tables
  driver: boolean;                                                     // false for avis and avis_reference
}): PgPolicy[];
```

The condition builders (`tenantIs`, `carrierIs`, `userIs`, `bookingIs`, `tokenIs`, `siteAllowed`, `linkedTenant`, `sharesOrg`, `and`) cover custom policies. drizzle-kit diffs policy expressions: changing a predicate yields `ALTER POLICY` statements in the unit's generated migration. [Data model](../reference/data-model.md) lists the class and policy summary of every table.

### Leak tests

Two test layers prove isolation.

**The party matrix** (`apps/api/src/db/rls.test.ts`) seeds both worlds and one or more rows in every table, then reads every RLS table under every party (and with no scope at all) as `rampflow_app`. It compares the rows each party gets with an oracle written from the data model over every row in the table, and fails on a row visible beyond policy or an allowed row that is missing. It also fails when a table gains RLS without an oracle entry, or when a table outside the documented list lacks RLS. `policies.test.ts` covers the write paths: driver lock and event, a carrier's update without a filter, carrier org creation, outbox inserts, token claim plus `asScope`, and the nested `withScope` refusal.

**Route cases.** Each module ships route cases next to its routes (`apps/api/src/modules/<module>/**/route-cases.ts`). The harness in `apps/api/test/route-cases.ts` seeds fresh worlds per case and runs:

1. **Foreign org.** B's actor with A's ids; then B's actor inside B's own org with A's other ids. It expects 404, or 200 with no id or booking code of world A in the body.
2. **Rival carrier.** For carrier cases, a second carrier linked to the same tenant, in its own org, with A's other ids. For driver cases, the driver of the rival booking. No id or code of the first carrier may appear.
3. **Site.** For a site-scoped case, an operator of the case's role limited to the tenant's other site expects 404, or 403 when that role lacks the permission (TN-01).
4. **Permission.** The highest role of the same party that lacks the permission expects 403 `forbidden`.
5. **Entitlement.** With the route's feature, and the feature that enables its module, overridden off, the case expects 403 `entitlement_required`.
6. **Control.** The case's own actor must get a status below 400, so a case that never reaches its handler cannot pass.

`apps/api/src/kernel/route-coverage.test.ts` compares `app.routes` with all route cases and fails for any `/api/t`, `/api/c`, `/api/platform` or `/api/driver` route without a case, and for a case that names no route. `/api/health`, `/api/auth/*`, `/api/me`, `/api/public/*` and `/api/test/*` are outside the guarded prefixes. The harness has its own tests: a handler that reads past RLS, a carrier route that shows a rival's booking, and routes without their permission or entitlement check each fail it. Repository functions are covered through their routes; a read that no route calls is dead code.

## Consequences

- A forgotten `where tenant_id = ...` returns nothing instead of another tenant's data, and the leak harness turns that into a failing test.
- Every request costs one transaction plus one `set_config` round trip, and policies add an indexed predicate per table. At the design load (300 sessions, 2,000 polling PWAs) this is far below the p95 targets; [ADR-0004](ADR-0004-booking-capacity-concurrency.md) measures the hot query.
- Request handlers cannot stream long responses inside the transaction. CSV exports build the file in memory (bounded by the 90-day KPI window) and return it.
- Adding a party means new policies on every table it may touch and a new row in the party matrix test. The parties above cover the MVP; adding one needs an ADR.
- Adding a table means an oracle entry in the party matrix; the test fails until it exists.
