---
title: ADR-0002 Tenancy isolation with application scoping and row-level security
description: How every request runs in one scoped transaction as a NOBYPASSRLS role, which parties exist (platform, tenant, carrier, carrier at tenant, driver, token, public, system), and how CI proves no route leaks across tenants.
type: explanation
audience: [agent, developer]
tags: [adr, tenancy, security, rls, postgres, testing]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/tech-architecture.md]
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

Use shared tables with explicit `tenant_id` and `carrier_id` columns, filter in every query, and enable RLS on every table that holds tenant or carrier data.

### Roles

- `rampflow_app` is `LOGIN NOBYPASSRLS` and owns no table. The API and the job runner connect only as this role.
- The owner role runs migrations ([ADR-0001](ADR-0001-data-access-drizzle-node-postgres.md)). Tables do not use `FORCE ROW LEVEL SECURITY`, because the app role is not the owner and the owner must be able to run data migrations.

### Scope and session variables

Every database access runs inside `withScope(scope, fn)`. The function opens a transaction and sets transaction-local variables with `set_config(name, value, true)`, so pooled connections never carry a scope into the next transaction.

```ts
// apps/api/src/db/scope.ts
export type Scope =
  | { party: 'user'; userId: UserId }                          // signed in, no org chosen: /api/me
  | { party: 'platform'; userId: UserId }
  | { party: 'tenant'; tenantId: TenantId; siteIds: readonly SiteId[] | 'all'; actor: TenantActor }
  | { party: 'carrier'; carrierId: CarrierId; userId: UserId; role: CarrierRole }
  | { party: 'carrier_at_tenant'; carrierId: CarrierId; tenantId: TenantId; userId: UserId }
  | { party: 'driver'; tenantId: TenantId; bookingId: BookingId; channel: 'link' | 'staff' }
  | { party: 'token'; tokenHash: TokenHash }                   // anonymous holder of an emailed token
  | { party: 'public'; tenantId: TenantId; siteId: SiteId }   // anonymous visitor of a public booking link
  | { party: 'system'; job: JobName };                         // cross-tenant job steps only

export type TenantActor =
  | { kind: 'user'; userId: UserId; role: TenantRole }
  | { kind: 'system'; job: JobName };                          // jobs and token redemption

export function withScope<T>(scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const v = sessionVariables(scope); // pure: Scope -> Record<'party' | 'user_id' | ..., string>
    await tx.execute(sql`select
      set_config('app.party', ${v.party}, true),
      set_config('app.user_id', ${v.user_id}, true),
      set_config('app.tenant_id', ${v.tenant_id}, true),
      set_config('app.carrier_id', ${v.carrier_id}, true),
      set_config('app.site_ids', ${v.site_ids}, true),
      set_config('app.booking_id', ${v.booking_id}, true),
      set_config('app.token_hash', ${v.token_hash}, true)`);
    return fn(tx);
  });
}
```

The baseline migration defines one SQL accessor per variable in schema `app`: `app.party()`, `app.user_id()`, `app.tenant_id()`, `app.carrier_id()`, `app.booking_id()`, `app.token_hash()`, plus two predicates:

```sql
create function app.site_allowed(site uuid) returns boolean language sql stable as $$
  select current_setting('app.site_ids', true) = '*'
      or site = any (string_to_array(nullif(current_setting('app.site_ids', true), ''), ',')::uuid[]) $$;

create function app.linked_tenant(tenant uuid) returns boolean language sql stable as $$
  select exists (select 1 from tenant_carrier_link l
                 where l.tenant_id = tenant and l.carrier_id = app.carrier_id()) $$;
```

Unset variables read as NULL or empty, and every comparison with them fails closed. Policies call the accessors as `(select app.tenant_id())`, so the planner evaluates them once per statement.

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
      c.set('access', await loadAccess(tx, scope)); // permissions, entitlements, settings loader
      await next();
      if (c.error || c.res.status >= 400) throw ROLLBACK; // a 409 after a partial write commits nothing
    }).catch((e) => { if (e !== ROLLBACK) throw e; });
  });
```

- Handlers use `c.var.db` and never import the pool. A Biome `noRestrictedImports` rule allows `apps/api/src/db/pool.ts` only inside `apps/api/src/db/` and `apps/api/src/kernel/`.
- Handlers raise domain errors with `throw new ApiError(...)`. The rollback rule also covers a handler that returns an error response.
- Scope resolution runs in its own short transaction: as `user` to read the caller's memberships, or as `token` to find the row a token hash names.

### How each context works

| Party | Entered by | Sees | Writes |
|---|---|---|---|
| `user` | Any signed-in request without an org: `/api/me`, invitation acceptance by a signed-in user | Own memberships and their orgs | Own profile; a new carrier org during acceptance |
| `platform` | `/api/platform/*` for `platform_admin` members of the platform org | All orgs, subscriptions, overrides, platform settings, invitations | The same. It has no policy on operational tenant tables. |
| `tenant` | `/api/t/:orgId/*` after the server finds the caller's membership in `:orgId`. Gate and dock operators carry their site list. | Rows with `tenant_id = app.tenant_id()`. Tables with `site_id` also require `app.site_allowed(site_id)`. | Same rows. |
| `carrier` | `/api/c/:orgId/*` after the membership check | Own bookings, avis and events at every tenant (`carrier_id = app.carrier_id()`); reference data (sites, load types, docks, logo) of linked tenants, including deactivated links so old bookings stay readable | Own org's users and invitations |
| `carrier_at_tenant` | `/api/c/:orgId/tenants/:tenantId/*`. The server first checks the carrier's link to the tenant; it must be active for create and reschedule. | Reference data of that tenant. All its bookings, for capacity counting. The `booking` row holds no personal data, so another carrier's booking reveals only slot, resource and company. | Bookings, avis, events and driver links with `carrier_id = app.carrier_id()` and `tenant_id = app.tenant_id()`; outbox rows |
| `driver` | `/api/driver/*` after the token cookie resolves to a valid `driver_access` row | The one booking (`id = app.booking_id()`), its avis, and the tenant's reference data and published safety content | Safety acknowledgements and their link to this booking |
| `token` | Invitation, carrier invitation and driver token exchange, before the holder has a session | Only the row whose `token_hash = app.token_hash()` | Marks that row used |
| `public` | `/api/public/links/:slug` after the slug lookup | That tenant's name, logo and the linked site | Carrier registrations for that tenant |
| `system` | Job runner steps that span tenants | `org` (to list tenants), `outbox_message`, `job_run` | `outbox_message`, `job_run` |

Rules that follow from the table:

- **Platform admins do not read tenant operations.** PL-04 usage counts run one short `tenant` scope per tenant with actor `system:usage` and return counts only.
- **Jobs work per tenant.** A job lists tenants under `system`, then processes each tenant in its own `tenant` scope with a system actor. RLS still confines each step to one tenant, and one tenant's failure does not roll back another's.
- **Token redemption switches scope.** Accepting a staff invitation reads and marks the invitation under `token`, then inserts the membership under `tenant` with actor `system:invitation`. Redeeming a driver's safety pass works the same way, because it reads acknowledgements beyond the current booking.
- **System actors are rare by construction.** `systemActor()` lives in `apps/api/src/kernel/system.ts`. A Biome override allows importing it only from `apps/api/src/modules/*/jobs/` and files named `*.redeem.ts`.

### Tables without RLS

Auth-owned tables hold no tenant data and are reachable only from `apps/api/src/modules/core/auth/`: `app_user`, `session`, `auth_token`, `rate_limit_event`. The public link lookup `public_link` (slug to tenant and site) and `job_run` hold no personal data. A Biome rule restricts imports of these schema objects to their owning directories.

### Policies are generated

`apps/api/src/db/rls.ts` builds `pgPolicy` arrays from a table's class, so a new table gets the same policies as its siblings:

```ts
export function tenantPolicies(t: TenantTable, o: {
  siteScoped: boolean;
  readers: readonly ('carrier' | 'carrier_at_tenant' | 'driver' | 'public')[];
}): PgPolicy[];
export function carrierOwnedPolicies(t: BookingFamilyTable): PgPolicy[]; // booking, avis, avis_reference, booking_event, driver_access
```

[Data model](../reference/data-model.md) lists the class and policy summary of every table.

### Leak tests

Each module ships route cases next to its routes (`apps/api/src/modules/<module>/**/route-cases.ts`). A case names the route, the permission, the entitlement, and how to fill its path parameters from a seeded world. The harness in `apps/api/test/route-cases.ts` runs three checks per case:

1. **Leak.** Two complete worlds, A and B, are seeded. The case runs as B's actor against A's ids, and also with A's org id in the path. It expects 404, or 200 with no A ids in the body.
2. **Permission.** The case runs as a role of the same party that lacks the permission, if one exists, and expects 403 `forbidden`.
3. **Entitlement.** The case runs for a tenant with the entitlement overridden off, and expects 403 `entitlement_required`.

`apps/api/src/kernel/route-coverage.test.ts` compares `app.routes` with all route cases and fails for any `/api/t`, `/api/c`, `/api/platform` or `/api/driver` route without a case. A short allowlist covers `/api/health`, `/api/auth/*` and `/api/test/*`. Repository functions are covered through their routes; a read that no route calls is dead code.

## Consequences

- A forgotten `where tenant_id = ...` returns nothing instead of another tenant's data, and the leak harness turns that into a failing test.
- Every request costs one transaction plus one `set_config` round trip, and policies add an indexed predicate per table. At the design load (300 sessions, 2,000 polling PWAs) this is far below the p95 targets; [ADR-0004](ADR-0004-booking-capacity-concurrency.md) measures the hot query.
- Request handlers cannot stream long responses inside the transaction. CSV exports build the file in memory (bounded by the 90-day KPI window) and return it.
- Adding a party means new policies on every table it may touch. The parties above cover the MVP; adding one needs an ADR.
