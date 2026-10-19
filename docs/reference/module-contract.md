---
title: Module contract
description: The manifest every module implements, the generated catalog of modules, permissions, settings, navigation and packages, how the API enforces entitlements, permissions and limits, how the web app gates routes and navigation, and how to add a module.
type: reference
audience: [agent, developer]
tags: [modules, entitlements, permissions, settings, navigation, api, frontend]
status: draft
updated: 2026-10-19
related: [docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md, docs/decisions/ADR-0007-settings-resolution.md, docs/decisions/ADR-0011-frontend-routes-and-org-context.md, docs/reference/api-routes.md]
---

# Module contract

A module is one body of domain knowledge with:

- a manifest in `packages/shared/src/modules/<id>/manifest.ts`,
- API code in `apps/api/src/modules/<id>/`,
- an i18n namespace `<id>` in `packages/i18n/locales/<locale>/<id>/`,
- screens in `apps/web/src/routes/<area>/...` and components in `apps/web/src/modules/<id>/`.

Design rationale: [ADR-0006](../decisions/ADR-0006-module-manifest-entitlements-permissions.md). Code: `packages/shared/src/contract/`.

## Manifest

```ts
// packages/shared/src/contract/module.ts
interface ModuleManifest<Id, E, P, S> {
  id: Id;                                   // 'booking'
  dependsOn: readonly string[];             // ids listed earlier in the catalog
  enabledBy: ImplementedFeatureIn<E> | null; // the module is off while this feature is off
  locales: 'staff' | 'driver';              // catalog locale set of the namespace
  entitlements: E;                          // { '<id>.<name>': FeatureDef | LimitDef }
  permissions: P;                           // { '<id>.<name>': { roles: [Role, ...Role[]] } }
  settings: S;                              // { '<id>.<name>': SettingDef }
  nav: readonly NavItem[];                  // label key `<id>:nav.<item id>`
}

type FeatureDef = { kind: 'feature'; reserved?: true };
type LimitDef = { kind: 'limit'; soft?: true; reserved?: true };   // value: number | null (unlimited)

interface SettingDef<Z extends z.ZodType> {
  schema: Z;                                // zod 4; bounds are the platform maximum
  default: z.output<Z>;
  scopes: readonly [SettingScope, ...SettingScope[]];   // 'platform' | 'tenant' | 'site'
  requires?: ImplementedFeatureIn<E>;       // hidden and rejected while off
}

type NavItem =
  | { id; area: 'tenant'; to; icon; permission; entitlement?: ImplementedFeatureIn<E> }
  | { id; area: 'carrier' | 'platform'; to; icon; permission };
```

Write a manifest with `defineModule({...})`. It returns the literal type, which the catalog uses to derive key unions. The compiler rejects, and `module.typetest.ts` proves it:

- a key without the `<id>.` prefix,
- a setting default outside its schema's type,
- `enabledBy`, `requires` or a nav `entitlement` that is reserved, a limit, or not declared by the module,
- a nav `permission` the module does not declare,
- an `entitlement` on carrier or platform navigation.

`validateCatalog(catalog, packages)` repeats these checks at runtime, adds dependency order, default-matches-schema, nav-permission-matches-area, nav-path-inside-area (`/t/$orgId/`, `/c/$orgId/`, `/platform/`, [ADR-0011](../decisions/ADR-0011-frontend-routes-and-org-context.md)) and package checks, and runs in `pnpm test`.

### Roles and permissions

A permission names the lowest roles that hold it. `ROLE_INCLUDES` adds the rest:

- `tenant_admin` includes `dispatcher`.
- `dispatcher` includes `gate_operator` and `dock_operator`.
- `carrier_admin` includes `carrier_user`.

`permissionsFor(catalog, role)` returns the expanded set. Drivers hold no role; driver routes check the driver scope instead.

### Derived types

`packages/shared/src/registry.ts` exports `catalog` and these types: `ModuleId`, `FeatureKey`, `LimitKey`, `EntitlementKey`, `ImplementedFeatureKey`, `ImplementedLimitKey`, `HardLimitKey`, `PermissionKey`, `SettingKey`, `SettingValue<K>`, `PackageValues`, `EntitlementOverride`, `Entitlements`.

### Pure functions

| Function | Returns |
|---|---|
| `resolveEntitlements(catalog, pkg, overrides, now)` | `{ features, limits, modules, sources }` for one tenant |
| `parseEntitlementOverride(catalog, raw)` | `Result` with `unknown_key`, `reserved_key` or `invalid_value` |
| `blockingFeature(catalog, entitlements, moduleId)` | the feature that keeps a module off, or `null` |
| `resolveSetting(catalog, key, { site, tenant, platform })` | `{ value, source }` |
| `parseSettingWrite(catalog, entitlements, { key, scope, value })` | `Result` with `unknown_key`, `scope_not_allowed`, `entitlement_required` or `invalid_value` (zod issues). Platform writes (PL-03) pass `entitlements: null`; a tenant or site write without entitlements throws |
| `isSettingAvailable(catalog, entitlements, key)` | module on and `requires` on |
| `permissionsFor(catalog, role)` | the role's permission set |
| `navFor(catalog, { area, permissions, entitlements? })` | visible nav items with their module |

## Catalog

Generated from `packages/shared/src/registry.ts` and `packages.ts` by `pnpm docs:index`. `pnpm docs:check` fails when these tables are stale.

<!-- catalog:start -->

### Modules

| Module | Depends on | Enabled by | Locales | Implemented entitlements | Reserved |
| --- | --- | --- | --- | --- | --- |
| `core` | none | always on | staff | `core.max_sites` (limit), `core.max_docks` (limit), `core.max_internal_users` (limit) | `core.sso`, `core.audit_log` |
| `i18n` | `core` | always on | staff | none | none |
| `privacy` | `core` | always on | staff | none | none |
| `brand` | `core` | `brand.logo` | staff | `brand.logo` | `brand.white_label`, `brand.custom_domain` |
| `integration` | `core` | always on | staff | none | `integration.api`, `integration.webhooks`, `integration.edi`, `integration.max_api_calls_per_day` (limit) |
| `booking` | `core` | always on | staff | `booking.carrier_portal`, `booking.public_link`, `booking.pools`, `booking.duration_rules`, `booking.max_bookings_per_month` (soft limit) | `booking.guest_link`, `booking.recurring`, `booking.carrier_quotas`, `booking.approval`, `booking.late_policy` |
| `avis` | `booking` | `avis.basic` | staff | `avis.basic` | `avis.custom_fields`, `avis.lines`, `avis.attachments` |
| `yard` | `booking` | `yard.checkin_qr` | staff | `yard.checkin_qr`, `yard.call_to_dock` | `yard.checkin_kiosk`, `yard.board`, `yard.queue`, `yard.map` |
| `safety` | `booking` | `safety.briefings` | staff | `safety.briefings`, `safety.validity`, `safety.quiz`, `safety.gate_enforcement`, `safety.max_briefing_templates` (limit) | `safety.media` |
| `notify` | `booking` | `notify.email` | staff | `notify.email`, `notify.reminders` | `notify.sms`, `notify.max_sms_per_month` (soft limit) |
| `report` | `booking`, `yard` | `report.basic` | staff | `report.basic`, `report.export` | `report.carrier_scorecard`, `report.scheduled` |
| `driver` | `booking` | always on | driver | none | none |

### Permissions

| Permission | Declared for | Held by |
| --- | --- | --- |
| `core.manage_tenants` | `platform_admin` | `platform_admin` |
| `core.manage_platform_settings` | `platform_admin` | `platform_admin` |
| `core.manage_staff` | `tenant_admin` | `tenant_admin` |
| `core.manage_settings` | `tenant_admin` | `tenant_admin` |
| `core.manage_sites` | `tenant_admin` | `tenant_admin` |
| `core.manage_carrier_users` | `carrier_admin` | `carrier_admin` |
| `privacy.manage_requests` | `tenant_admin` | `tenant_admin` |
| `brand.manage` | `tenant_admin` | `tenant_admin` |
| `booking.view` | `gate_operator`, `dock_operator`, `carrier_user` | `tenant_admin`, `dispatcher`, `gate_operator`, `dock_operator`, `carrier_admin`, `carrier_user` |
| `booking.book` | `carrier_user` | `carrier_admin`, `carrier_user` |
| `booking.staff_book` | `dispatcher` | `tenant_admin`, `dispatcher` |
| `booking.walk_in` | `gate_operator` | `tenant_admin`, `dispatcher`, `gate_operator` |
| `booking.force` | `dispatcher` | `tenant_admin`, `dispatcher` |
| `booking.view_actors` | `tenant_admin` | `tenant_admin` |
| `booking.manage_resources` | `tenant_admin` | `tenant_admin` |
| `booking.manage_carriers` | `dispatcher` | `tenant_admin`, `dispatcher` |
| `yard.gate` | `gate_operator` | `tenant_admin`, `dispatcher`, `gate_operator` |
| `yard.call` | `gate_operator`, `dock_operator` | `tenant_admin`, `dispatcher`, `gate_operator`, `dock_operator` |
| `yard.dock` | `dock_operator` | `tenant_admin`, `dispatcher`, `dock_operator` |
| `safety.manage_briefings` | `tenant_admin` | `tenant_admin` |
| `safety.view_register` | `dispatcher` | `tenant_admin`, `dispatcher` |
| `report.view` | `dispatcher` | `tenant_admin`, `dispatcher` |

### Settings

| Setting | Default | Scopes | Requires |
| --- | --- | --- | --- |
| `i18n.default_locale` | `"de"` | platform, tenant, site |  |
| `privacy.notice_url` | `null` | platform, tenant, site |  |
| `privacy.retention.driver_phone_days` | `7` | platform, tenant |  |
| `privacy.retention.driver_identity_days` | `90` | platform, tenant |  |
| `privacy.retention.visit_days` | `395` | platform, tenant |  |
| `privacy.retention.safety_after_expiry_days` | `730` | platform, tenant |  |
| `privacy.retention.audit_log_days` | `365` | platform, tenant |  |
| `privacy.retention.driver_link_hours` | `24` | platform |  |
| `privacy.retention.carrier_inactive_days` | `730` | platform |  |
| `booking.slot_grid_minutes` | `30` | platform, tenant, site |  |
| `booking.min_lead_minutes` | `120` | platform, tenant, site |  |
| `booking.horizon_days` | `30` | platform, tenant, site |  |
| `booking.cancel_cutoff_minutes` | `120` | platform, tenant, site |  |
| `booking.close_on_public_holidays` | `true` | platform, tenant, site |  |
| `booking.require_plate` | `false` | platform, tenant, site |  |
| `booking.public_link_enabled` | `false` | site | `booking.public_link` |
| `booking.public_registration_mode` | `"approval_required"` | tenant, site | `booking.public_link` |
| `avis.required_reference_types` | `[]` | platform, tenant, site |  |
| `avis.unique_references` | `false` | tenant, site |  |
| `avis.require_gross_weight` | `false` | platform, tenant, site |  |
| `avis.require_driver_phone` | `false` | platform, tenant, site |  |
| `yard.early_tolerance_minutes` | `30` | platform, tenant, site |  |
| `yard.grace_minutes` | `15` | platform, tenant, site |  |
| `yard.no_show_after_minutes` | `60` | platform, tenant, site |  |
| `yard.standgeld_flag_minutes` | `120` | platform, tenant, site |  |
| `safety.validity_days` | `365` | platform, tenant, site |  |
| `safety.require_for_checkin` | `true` | platform, tenant, site | `safety.gate_enforcement` |
| `safety.quiz_pass_percent` | `100` | platform, tenant | `safety.quiz` |
| `notify.reminder_hours_before` | `24` | platform, tenant, site | `notify.reminders` |

### Navigation

| Label key | Area | Path | Permission | Entitlement |
| --- | --- | --- | --- | --- |
| `core:nav.tenants` | platform | `/platform/tenants` | `core.manage_tenants` |  |
| `core:nav.packages` | platform | `/platform/packages` | `core.manage_tenants` |  |
| `core:nav.platform_settings` | platform | `/platform/settings` | `core.manage_platform_settings` |  |
| `core:nav.sites` | tenant | `/t/$orgId/sites` | `core.manage_sites` |  |
| `core:nav.staff` | tenant | `/t/$orgId/staff` | `core.manage_staff` |  |
| `core:nav.settings` | tenant | `/t/$orgId/settings` | `core.manage_settings` |  |
| `core:nav.users` | carrier | `/c/$orgId/users` | `core.manage_carrier_users` |  |
| `privacy:nav.privacy` | tenant | `/t/$orgId/privacy` | `privacy.manage_requests` |  |
| `brand:nav.brand` | tenant | `/t/$orgId/brand` | `brand.manage` |  |
| `booking:nav.plan` | tenant | `/t/$orgId/plan` | `booking.view` |  |
| `booking:nav.carriers` | tenant | `/t/$orgId/carriers` | `booking.manage_carriers` |  |
| `booking:nav.bookings` | carrier | `/c/$orgId/bookings` | `booking.view` |  |
| `booking:nav.book` | carrier | `/c/$orgId/book` | `booking.book` |  |
| `booking:nav.tenants` | carrier | `/c/$orgId/tenants` | `booking.view` |  |
| `yard:nav.gate` | tenant | `/t/$orgId/gate` | `yard.gate` |  |
| `yard:nav.docks` | tenant | `/t/$orgId/docks` | `yard.call` | `yard.call_to_dock` |
| `safety:nav.briefings` | tenant | `/t/$orgId/safety/briefings` | `safety.manage_briefings` |  |
| `safety:nav.acknowledgements` | tenant | `/t/$orgId/safety/acknowledgements` | `safety.view_register` |  |
| `report:nav.reports` | tenant | `/t/$orgId/reports` | `report.view` |  |

### Packages

| Key | start | pro | enterprise |
| --- | --- | --- | --- |
| `core.max_sites` | `1` | `5` | `null` |
| `core.max_docks` | `10` | `60` | `null` |
| `core.max_internal_users` | `10` | `75` | `null` |
| `booking.max_bookings_per_month` | `1500` | `10000` | `null` |
| `safety.max_briefing_templates` | `2` | `20` | `null` |
| `booking.carrier_portal` | `true` | `true` | `true` |
| `booking.public_link` | `true` | `true` | `true` |
| `booking.pools` | `true` | `true` | `true` |
| `booking.duration_rules` | `true` | `true` | `true` |
| `avis.basic` | `true` | `true` | `true` |
| `yard.checkin_qr` | `true` | `true` | `true` |
| `yard.call_to_dock` | `true` | `true` | `true` |
| `safety.briefings` | `true` | `true` | `true` |
| `safety.validity` | `true` | `true` | `true` |
| `notify.email` | `true` | `true` | `true` |
| `notify.reminders` | `true` | `true` | `true` |
| `report.basic` | `true` | `true` | `true` |
| `report.export` | `true` | `true` | `true` |
| `brand.logo` | `true` | `true` | `true` |
| `safety.quiz` |  | `true` | `true` |
| `safety.gate_enforcement` |  | `true` | `true` |

<!-- catalog:end -->

## API enforcement

### Request environment

```ts
// apps/api/src/kernel/env.ts (U1)
export interface AppEnv {
  Variables: {
    scope: Scope;     // ADR-0002
    db: Tx;           // the request transaction
    clock: Clock;     // { now(): Date }, fixed in tests
    access: Access;
  };
}

export interface Access {
  role: Role | null;                              // null for driver, token, public, user, system and system actors
  permissions: ReadonlySet<PermissionKey>;
  entitlements: Entitlements | null;              // the acting tenant's (tenant, carrier_at_tenant, driver, public); null otherwise
  setting<K extends SettingKey>(key: K, siteId: SiteId | null): Promise<ResolvedSetting<SettingValue<K>>>;
}
```

`loadAccess` reads `tenant_subscription` and `entitlement_override` for the scope's tenant, parses overrides with `parseEntitlementOverride` (skipping and logging stale rows), and calls `resolveEntitlements` with `clock.now()`. `setting()` loads the platform, tenant and site rows once per request and calls `resolveSetting`.

### Middleware

```ts
// apps/api/src/kernel/access.ts (U1)
export function requireModule(id: ModuleId): MiddlewareHandler<AppEnv>;
// 403 entitlement_required, details.key = blockingFeature(...). Applied once per router at mount.

export function requirePermission(key: PermissionKey): MiddlewareHandler<AppEnv>;
// 403 forbidden when access.permissions lacks the key.

export function requireEntitlement(key: ImplementedFeatureKey): MiddlewareHandler<AppEnv>;
// 403 entitlement_required, details.key = key. For features finer than the module, e.g. yard.call_to_dock.

export async function withinLimit(
  tx: Tx, tenantId: TenantId, entitlements: Entitlements,
  key: HardLimitKey, count: (tx: Tx) => Promise<number>,
): Promise<void>;
// Takes a transaction-scoped advisory lock on (tenant, key), then 409 limit_reached { key, limit }
// when count + 1 > limit. The advisory lock needs no UPDATE policy on org (U1 deviation from ADR-0004).
// Soft limits do not compile here.
```

Order on a route: scope (mount) → module (mount) → permission → entitlement → validation → handler. A failed scope check answers 404 so a foreign org id reveals nothing.

### Mounting

`apps/api/src/modules/index.ts` (U1) is the only file that mounts routers. Each module area exports one router per party from `routes.<party>.ts`, mounted at `/<area>`:

```ts
// apps/api/src/modules/index.ts
const tenant = new Hono<AppEnv>()
  .use(scoped(tenantScope))                        // becomes /t/:orgId/* once mounted
  .route('/context', coreContext.tenant)
  .route('/sites', coreSites.tenant)
  .route('/capacity', bookingCapacity.tenant)
  .route('/bookings', bookingStaff.tenant)
  .route('/yard', withModule('yard', yard.tenant))  // requireModule applies to /yard/* only
  .route('/safety', withModule('safety', safetyAuthoring.tenant));
  // ...
const carrier = new Hono<AppEnv>()
  .use(scoped(carrierScope))                       // carrier, or carrier_at_tenant under /at/:tenantId
  .route('/bookings', portal.carrier)
  .route('/at/:tenantId', portal.carrierAtTenant);
  // ...
export const modulesApi = new Hono<AppEnv>()
  .route('/t/:orgId', tenant)
  .route('/c/:orgId', carrier)
  .route('/platform', platform)
  .route('/driver', driver)
  .route('/public', publicApi);
```

- The scope middleware sits once per area, so no request opens two scoped transactions.
- `withModule` needs a non-root prefix; its middleware then stays inside that router. Routers of always-on modules (`core`, `booking`, `privacy`) need no wrapper.
- U1 creates every router file named in [API routes](api-routes.md) as an empty `new Hono<AppEnv>()` and mounts it, so units only fill their own files and `AppType` stays one chain for the `hc` client.

### A route

```ts
// apps/api/src/modules/yard/routes.tenant.ts (U9), mounted at /t/:orgId/yard
export const tenant = new Hono<AppEnv>().post(
  '/bookings/:bookingId/check-in',
  requirePermission('yard.gate'),
  zValidator('param', BookingParam, onInvalid),
  zValidator('json', CheckInBody, onInvalid),     // 422 validation_failed with zod paths
  async (c) => {
    const { bookingId } = c.req.valid('param');
    const booking = await checkIn(c.var.db, actorOf(c), bookingId, c.req.valid('json'));
    return c.json(booking, 200);
  },
);
```

### Route cases

Every route under `/api/t`, `/api/c`, `/api/platform` and `/api/driver` has a case in a `route-cases.ts` file next to its router:

```ts
// apps/api/test/route-cases.ts (U1)
export interface RouteCase {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;                                  // the Hono pattern, as in app.routes
  as: Role | 'driver';                           // a role that may call it
  permission: PermissionKey | 'member' | 'driver';
  entitlement: ImplementedFeatureKey | null;     // beyond the module gate
  params: (world: World) => Record<string, string>;
  body?: (world: World) => unknown;
  setup?: (world: World, db: OwnerDb) => Promise<void>; // module fixtures in worlds A and B, as the owner
  foreign: 'not_found' | 'empty';                // expected result as world B
  siteScoped: boolean;                           // a gate operator of another site gets 404
}
export function defineRouteCases(cases: readonly RouteCase[]): readonly RouteCase[];
```

The harness (`checkRouteCase`) seeds fresh worlds A and B per case (each with two sites, a carrier and a rival carrier linked to the tenant, and one booking per carrier and site) and runs the foreign-org, rival-carrier, foreign-site, permission, entitlement and control checks of [ADR-0002](../decisions/ADR-0002-tenancy-isolation-rls.md#leak-tests). `test/route-cases.test.ts` runs every case of every module; `route-coverage.test.ts` fails for a guarded route without a case and for a case that names no route. A case's `as: 'driver'` acts with the link of `A.bookings.own`.

Routes under `/api/me`, `/api/auth` and `/api/public` export `accountCases` from the same file instead:

```ts
export interface AccountRouteCase {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  credential: 'session' | 'token' | 'none';       // rf_session, a `token` in the body, or open
  singleUse?: boolean;                            // token routes; default true: a second call answers 401
  // The control call; token cases also return a valid token of another purpose, which must fail.
  // `params` fills path parameters such as the `:slug` of a public link.
  arrange: (world: World, db: OwnerDb) => Promise<{
    actor: Actor; body?: unknown; otherToken?: string; params?: Record<string, string>;
  }>;
}
export function defineAccountCases(cases: readonly AccountRouteCase[]): readonly AccountRouteCase[];
```

`checkAccountCase` runs the anonymous, wrong-party and foreign-world checks of [API routes](api-routes.md#leak-permission-and-entitlement-tests); `route-coverage.test.ts` requires an account case for every route under those prefixes.

## Context endpoints

| Endpoint | Body |
|---|---|
| `GET /api/me` | `{ user: { id, name, email, locale }, memberships: [{ orgId, orgKind, orgName, role }] }` |
| `GET /api/t/:orgId/context` | `{ org, role, permissions, entitlements, sites: [{ id, name, timeZone }], settings: { [siteId]: { [key]: { value, source } } } }`. Settings include only available keys. |
| `GET /api/c/:orgId/context` | `{ org, role, permissions, tenants: [{ id, name, linkStatus, carrierPortal, logoUrl }] }` |
| `GET /api/platform/context` | `{ role, permissions }` |

The response schemas live in `packages/shared/src/modules/core/api.context.ts` (U2).

## Web gating

```ts
// apps/web/src/lib/access.ts (U2)
export function guard(req: { permission: PermissionKey; entitlement?: ImplementedFeatureKey }):
  (opts: { context: Partial<AreaRouteContext> }) => void;
// Renders the area's "no access" page in place of the screen (the URL stays) when the permission
// is missing, when the module of the permission's prefix is off, or when the entitlement is off.
// The area layout's beforeLoad puts { me, access } into the router context of every child route.

export function useAccess(): {
  area: 'tenant' | 'carrier' | 'platform';
  orgId: string | null;
  can(permission: PermissionKey): boolean;
  has(feature: ImplementedFeatureKey): boolean;
  setting<K extends SettingKey>(key: K, siteId: string): SettingValue<K>;
};

// Query options of the context requests, and of GET /api/me.
export const meQuery, tenantContextQuery(orgId), carrierContextQuery(orgId), platformContextQuery;
```

Other pieces of the web shell (U2):

| Piece | Where | Use |
| --- | --- | --- |
| `api`, `call()`, `ApiFailure` | `lib/api.ts` | `call(api.t[':orgId'].sites.$get({ param }))` returns the JSON body or throws `ApiFailure` with `code`, `reason`, `issues`. Failed queries and mutations toast `core:errors.<code>` (or `core:errors.conflict.<reason>`) unless `meta: { silent: true }`; a 401 goes to `/login?redirect=`. |
| `queryKeys` | `lib/query-keys.ts` | Keys start with `[area, orgId]`: `['tenant', orgId, '<module>', ...]`. |
| `siteTime`, `useSiteTime()` | `lib/time.ts` | `<SiteTime {...siteTime(instant, site.timeZone, locale)} />`: site wall clock with zone label, plus the viewer's time when it differs. Delegates to `formatSiteTime` once U4's time module lands. |
| `useLocale()`, `applyLocale()` | `lib/i18n.ts` | UI language: the user's `locale`, else the tenant's `i18n.default_locale`, else this device's choice, else the browser's, else `de`. Keys are typed: `t(($) => $.auth.login.title)`. |
| `useFragmentToken()`, `useExchangeOnce()` | `hooks/use-fragment-token.ts` | Token pages read `location.hash` once, strip it, and post the token exactly once. |
| `applyServerIssues()`, `useFieldMessage()`, `errorText()` | `components/app-shell/form-errors.ts` | Puts 422 zod issues on form fields; field messages by zod issue code. |
| `AuthLayout`, `AppShell`, `StationShell`, `NoAccess` | `components/app-shell/` | Area layouts render them; screens do not. |
| `staticData.shell` | route option | `'station'` renders the tablet station layout: no sidebar, `?site=` (written from this device's last site or the first allowed one), site clock, live or offline pill. |

```ts
// apps/web/src/routes/t/$orgId/gate/index.tsx (U9)
export const Route = createFileRoute('/t/$orgId/gate/')({
  beforeLoad: guard({ permission: 'yard.gate' }),
  staticData: { shell: 'station' },               // tablet layout without the sidebar (ADR-0011)
  validateSearch: GateSearch,                     // { site?: uuid, tab?, checkin?: uuid, walkin?: 1 }
  component: GatePage,
});
```

- Every screen's path, search params and entry point are in the route map of [ADR-0011](../decisions/ADR-0011-frontend-routes-and-org-context.md#route-map). A screen without a nav item names the screen that links to it.

- The sidebar renders `navFor(catalog, ...)` with labels from `<module>:nav.<id>`.
- Buttons for booking actions read the lifecycle table ([Booking lifecycle](booking-lifecycle.md)) and `can()`, so a dock operator never sees "Check out".
- The UI only hides. The API decides.

## Directory layout

| Path | Contents |
|---|---|
| `packages/shared/src/modules/<id>/manifest.ts` | the manifest |
| `packages/shared/src/modules/<id>/api.<area>.ts` | zod request and response schemas shared by API and web, imported as `@rampflow/shared/modules/<id>/api.<area>` |
| `apps/api/src/modules/<id>/schema*.ts` | Drizzle tables and policies, discovered by glob |
| `apps/api/src/modules/<id>/<area>/routes.<party>.ts` | Hono routers, mounted by `modules/index.ts` |
| `apps/api/src/modules/<id>/<area>/*.ts` | services and repositories: functions that take `tx` |
| `apps/api/src/modules/<id>/<area>/route-cases.ts` | route cases |
| `apps/api/src/modules/<id>/emails/<name>.tsx` | email templates, id `<id>.<name>` |
| `apps/api/src/modules/<id>/jobs/<name>.ts` | jobs, discovered at startup |
| `packages/i18n/locales/<locale>/<id>/<part>.json` | catalogs |
| `apps/web/src/routes/<area>/...` | screens |
| `apps/web/src/modules/<id>/` | screen components |
| `e2e/<id>/<story-id>.spec.ts` | one Playwright `describe` per story ID |

## Add a module

1. **Contract (coordinator, on main before the wave).**
   1. Write `packages/shared/src/modules/<id>/manifest.ts` with `defineModule`.
   2. Add it to `catalog` in `registry.ts` after every module in its `dependsOn`.
   3. Add its implemented keys to the packages in `packages.ts` where the pricing places them.
   4. Run `pnpm --filter @rampflow/shared test` and `pnpm docs:index`.
   5. Create the router files named in [API routes](api-routes.md), mount them with `withModule('<id>', ...)` in `apps/api/src/modules/index.ts`, and create the i18n part files `nav.json`, `entitlements.json` and `settings.json` in every locale of the module's set.
2. **Implementation (unit).**
   1. Tables in `schema*.ts` with policies from `apps/api/src/db/rls.ts`; then `pnpm db:generate --name <unit-id>`.
   2. Routes with `requirePermission`, `requireEntitlement` where finer than the module, and zod validation.
   3. A route case for every route.
   4. Screens with `guard`, components from shadcn, forms with `Field`.
   5. One Playwright spec per story ID.
   6. Update this module's sections in [Data model](data-model.md) and [API routes](api-routes.md).
