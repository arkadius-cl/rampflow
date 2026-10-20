---
title: API routes
description: API conventions (areas, auth, error envelope and codes, validation, OpenAPI description, pagination, idempotency, concurrency, time and CSV formats) and the generated route tables per section with party, permission, entitlement, story IDs, router file and notes.
type: reference
audience: [agent, developer]
tags: [api, routes, errors, tenancy, entitlements, permissions, openapi]
status: draft
updated: 2026-10-20
related: [docs/decisions/ADR-0013-openapi-from-routes-and-typescript.md, docs/reference/module-contract.md, docs/reference/booking-lifecycle.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md, docs/decisions/ADR-0011-frontend-routes-and-org-context.md]
---

# API routes

Hono 4 on `/api`. The web app calls it through the `hc` client typed by `AppType`. Request schemas (zod) and named response types (TypeScript) live in `packages/shared/src/modules/<module>/api.<area>.ts`. The full description with every request and response schema is the OpenAPI document `apps/api/openapi.gen.json` (see [OpenAPI](#openapi)). The route tables below are generated from the same source.

## Conventions

### Areas and parties

| Prefix | Party ([ADR-0002](../decisions/ADR-0002-tenancy-isolation-rls.md)) | Resolved from |
|---|---|---|
| `/api/auth` | `anonymous`, `user` | session cookie if present |
| `/api/me` | `user` | session cookie |
| `/api/platform` | `platform` | session plus `platform_admin` membership |
| `/api/t/:orgId` | `tenant` | session plus membership in `:orgId`; site list for gate and dock operators |
| `/api/c/:orgId` | `carrier` | session plus membership in `:orgId` |
| `/api/c/:orgId/at/:tenantId` | `carrier_at_tenant` | as carrier, plus a link between the carrier and `:tenantId` |
| `/api/driver` | `driver` | `rf_driver` cookie ([ADR-0008](../decisions/ADR-0008-driver-token-pwa-delivery.md)) |
| `/api/public` | `token` or `public` | a token in the body, or a public link slug |
| `/api/test` | none | mounted only when `ENABLE_TEST_ROUTES=1`; startup fails if that is set with `NODE_ENV=production` or without `NODE_ENV`, which counts as production |

- A failed membership or link check answers 404 `not_found`, so a foreign org id reveals nothing.
- Router files are `apps/api/src/modules/<module>/<area>/routes.<party>.ts`. Each mounts at the prefix its section below names, inside its party prefix. Routers of modules that can be off are wrapped with `withModule(id, ...)`, which needs a non-root prefix so its middleware stays inside that router.
- In the tables, **Permission** `member` means any member of the org; `driver` means a valid driver cookie; `token` means a valid token in the body; `none` means no credential. **Entitlement** shows `module <id>` for a module guard, a feature key for a feature guard, and `limit <key>` for a hard limit the service checks. Conditions that only the service checks (for example `booking.pools` for pools) are in the notes.

### Requests

- JSON bodies with `Content-Type: application/json`. Exceptions: `PUT /brand/logo` takes the raw image body, and `*.csv` routes return `text/csv`.
- Mutating requests need `Origin` equal to `APP_ORIGIN` or one of `APP_EXTRA_ORIGINS`, else 403 `forbidden` ([ADR-0003](../decisions/ADR-0003-authentication-self-built-sessions.md)).
- Personal search terms (driver name, phone, plate) travel in POST bodies, never in query strings, so they stay out of logs.
- Path ids are UUIDs. A malformed id answers 404, like an unknown one.

### Responses and errors

Success: 200 for reads and commands, 201 for a created resource, 202 when the only effect is an email, 204 for deletes.

Every error has this body:

```json
{ "error": { "code": "limit_reached", "message": "Your package allows 1 site.", "details": { "key": "core.max_sites", "limit": 1 } } }
```

`message` is English for logs and developers. The UI shows `core:errors.<code>` (or `core:errors.conflict.<reason>`) in the user's language.

| Status | `code` | `details` | When |
|---|---|---|---|
| 400 | `bad_request` | `{ reason }` | malformed JSON; unknown or reserved entitlement key (`unknown_key`, `reserved_key`); unknown setting key; setting scope not allowed (`scope_not_allowed`, `allowed`) |
| 401 | `unauthorized` | | no valid session; unknown, expired or revoked driver or email token |
| 403 | `forbidden` | | missing permission; foreign `Origin` |
| 403 | `entitlement_required` | `{ key }` | the module, a route feature or a setting's required feature is off |
| 404 | `not_found` | | unknown id, an id of another tenant, carrier, site or booking, or an org the caller is not a member of |
| 409 | `conflict` | `{ reason, ... }` | `capacity_full` (with `offers`), `daily_cap_reached` (with `offers`), `closed`, `dock_occupied`, `dock_in_resource`, `invalid_transition` (with `status`), `cutoff_passed`, `stale_version` (with `version`), `duplicate_reference`, `already_member`, `link_inactive`, `quiz_incomplete` (with `locales`, `min`, `max`), `quiz_not_passed`, `duplicate_code`, `holiday_closure`, `manual_closure`, `not_offered` (with `offers`: off the slot grid, or for carriers outside lead time and horizon), `safety_missing` (with `instructionIds`), `acknowledgement_invalid` (with `status`), `dock_inactive`, `not_due` (with `dueAt`, no-show job only); `dock_in_resource` carries the taken `dockIds` |
| 409 | `limit_reached` | `{ key, limit }` | a hard limit would be exceeded |
| 422 | `validation_failed` | `{ issues: [{ path, code, message }] }` | the zod schema rejected body or query; `path` is the zod issue path, for example `["avis", "dangerousGoods", "items", 0, "unNumber"]` |
| 429 | `rate_limited` | `{ retryAfterSeconds }` | auth and driver exchange limits |
| 500 | `internal_error` | | anything else; logged with a request id |

TN-03's "a deactivated link blocks new bookings (403)" uses 403 `forbidden` with `details.reason = 'link_inactive'`.

### Validation

`validate(target, schema)` from `kernel/validate.ts` validates `param`, `query` and `json` with a zod schema. A `param` failure answers 404; a `query` or `json` failure answers 422 with zod paths. `validate()` also records the schema for the OpenAPI document. Business rules that need data (capacity, cutoff, limits) answer 409.

### OpenAPI

`pnpm api:docs` writes `apps/api/openapi.gen.json`, an OpenAPI 3.1 description of every route except `/api/test` and the docs routes, and the route tables in this file ([ADR-0013](../decisions/ADR-0013-openapi-from-routes-and-typescript.md)). `pnpm verify` runs `pnpm api:docs --check`, which fails when either is stale.

- **Sources.** The paths, methods, guards and validators come from the running app. Each route starts with `op({ id, stories, description, limits?, body?, responses })` from `kernel/describe.ts`. `responses` names a type per success status: `type<Name>()` for a JSON body, `noBody`, or `file('<media type>')`. A JSON response type is a named type exported from `packages/shared/src/modules/<module>/api*.ts`. The generator checks it against what the handler returns, in both directions.
- **Allowlist.** `apps/api/openapi.allowlist.json` lists the operations whose JSON responses had no named type when the description was introduced. Their schema is derived from the handler and written inline. The list may only shrink: the generator fails for a route without a named type that is not on it, and for a listed route that has one.
- **Metadata.** Each operation carries `x-party`, `x-permission`, `x-entitlement` (module or feature), `x-limits`, `x-stories` and `x-router`. It also lists the error statuses its guards and validators can produce (401, 403, 404, 409, 422) with the error envelope. The `409 conflict` reasons stay in the description.
- **Tables.** Each section below has its table between `<!-- routes:<section>:start -->` and `<!-- routes:<section>:end -->`. Edit the `op()` call, not the table. The prose around the tables is written by hand.
- **Browsing.** With `ENABLE_API_DOCS=1` (the dev default, refused in production), the API serves Swagger UI at `/api/docs` and the document at `/api/openapi.json`. To try routes there or in Bruno and Postman, see [Run locally](../how-to/run-locally.md).

### Security headers

Every answer of the API, and of the SPAs it serves in production, carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'` (`kernel/security-headers.ts`). A response that sets its own policy keeps it: `/d` keeps the driver CSP and `no-referrer` ([ADR-0008](../decisions/ADR-0008-driver-token-pwa-delivery.md)). With `NODE_ENV=production` every answer also carries `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

### Pagination

Two paging styles ([ADR-0015](../decisions/ADR-0015-data-tables-and-entity-views.md)):

- **Data-table lists** (today: `GET /api/platform/tenants`) take the list query: `q` (case-insensitive substring, at most 100 characters; `%`, `_` and `\` match themselves), `sort` (one of the list's sortable columns), `order` (`asc` or `desc`), one comma-separated parameter per facet (`package=start,pro`), `page` (1 to 10000, default 1) and `pageSize` (10, 25, 50 or 100, default 25). Each parameter is optional. They answer `{ items, total, page, pageSize, facets }`: `total` counts the rows matching the search and every facet, `facets.<name>.<value>` counts the rows matching the search and every other facet, and rows with equal sort values come in id order. A page past the end answers 200 with no items. An invalid or unknown parameter answers 422 `validation_failed` with its zod path (`["pageSize"]`, `["package", 0]`).
- **Streams** that grow without bound (bookings, visits, acknowledgements, events) are cursor-paginated: `?limit=50&cursor=<opaque>` returns `{ items, nextCursor: string | null }`. `limit` is 1 to 200, default 50. The cursor encodes the sort key and the id.

Master-data lists not yet on the data table (sites, docks, resources, load types, staff) return `{ items }` without paging.

### Idempotency and concurrency

- `POST` booking creation takes `clientRequestId` (UUID, generated per form submission). A retry with the same id by the same user returns 200 and the existing booking instead of 201 and a second booking.
- Lifecycle commands are idempotent: repeating a command whose target state and input already match returns 200 without a new event ([Booking lifecycle](booking-lifecycle.md)).
- `PUT` replaces and `DELETE` answers 204 even when nothing existed.
- Edits of bookings and avis carry `version`; a mismatch answers 409 `conflict` with reason `stale_version` and the current `version`.
- Email-only endpoints (magic link, password reset, registration) answer 202 whether or not the address exists.

### Time and formats

- Instants are ISO 8601 UTC strings (`2026-10-25T06:30:00.000Z`). Local dates are `YYYY-MM-DD`, wall times `HH:mm`. Each booking and site carries its `timeZone` ([ADR-0012](../decisions/ADR-0012-time-handling.md)).
- CSV (RP-02, SF-03): UTF-8 with BOM, `;` for de and pl users and `,` for en, timestamps in ISO 8601 with the site offset (`2026-10-25T08:30:00+01:00`), header row from the user's locale.

### Leak, permission and entitlement tests

Every route in the tables below under `/api/t`, `/api/c`, `/api/platform` and `/api/driver` has a route case ([Module contract](module-contract.md)). The harness checks:

1. **Foreign tenant, carrier or booking**: 404 or an empty list.
2. **Foreign site**: for routes that take a site, hall, dock, resource, load type or booking, a gate operator limited to another site of the same tenant gets 404 (TN-01).
3. **Missing permission**: 403 `forbidden`.
4. **Entitlement off**: 403 `entitlement_required`.
5. **Undeclared entitlement**: the control call runs with every implemented feature that gates routes rather than modules turned off, except the one the case declares. A 403 `entitlement_required` there means the route checks a feature its case leaves out, so a gate cannot exist without its entitlement test.

Routes under `/api/me`, `/api/auth` and `/api/public` take no org id. Each has an account case (`defineAccountCases` in the same `route-cases.ts`, exported as `accountCases`) with its credential: `session`, `token` or `none`. The harness checks that a session route answers 401 without a session and with a driver cookie, and shows the same role in world B nothing of world A; that a token route answers 401 for an unknown token, a driver token and a token of another purpose, even with a session, and for a single-use token the second time; and that every control answer shows nothing of world B. `route-coverage.test.ts` fails for a route under these prefixes without an account case.

## Auth, me and invitations

Unit U2. Router files in `apps/api/src/modules/core/`.

`/api/me` also carries the signed-in user's UI preferences, `uiPrefs`. `GET` returns the stored keys that are known and valid; `PATCH` accepts any subset of the known keys and merges it key by key into the stored object, so two browsers writing different keys keep both ([ADR-0014](../decisions/ADR-0014-user-ui-preferences.md)).

<!-- routes:auth-me-and-invitations:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/health` | anonymous | none |  |  | `app.ts` | Liveness and database check; 503 with `db: error` when the database does not answer. |
| POST | `/api/auth/login` | anonymous | none |  | CR-03 | `core/auth/routes.anonymous.ts` | `{ email, password }` → 200 `{ ok }`; sets `rf_session`. A wrong password, an unknown, unverified or disabled email all answer the same 401; 429 `rate_limited` after 5 failures in 15 minutes for the email and client address, or 30 for the client address alone |
| POST | `/api/auth/logout` | user | member |  | CR-03 | `core/auth/routes.anonymous.ts` | 204; deletes the session and clears the cookie |
| POST | `/api/auth/magic-link` | anonymous | none |  | CR-03 | `core/auth/routes.anonymous.ts` | `{ email, locale? }`; 202. Sends only to verified, enabled accounts, in `locale` (the page's language, default `de`); stops sending after 5 per hour per email |
| POST | `/api/auth/magic-link/inspect` | anonymous | token |  | CR-03 | `core/auth/routes.anonymous.ts` | `{ token }` → 200 `{ email }` of the account the link signs in to, without using the link; 401 for an unknown, used or expired link. `/auth/magic` shows it and exchanges only after the holder clicks "Continue as" (login CSRF) |
| POST | `/api/auth/magic-link/exchange` | anonymous | token |  | CR-03 | `core/auth/routes.anonymous.ts` | `{ token }` → 200 `{ ok }`; sets `rf_session`; single use, 15 minutes |
| POST | `/api/auth/password-reset` | anonymous | none |  | CR-03 | `core/auth/routes.anonymous.ts` | `{ email, locale? }`; 202, as for the magic link (unverified accounts included) |
| POST | `/api/auth/password-reset/confirm` | anonymous | token |  | CR-03 | `core/auth/routes.anonymous.ts` | `{ token, password }` → 200 `{ ok }`; sets the password, verifies the email, deletes every session of the user and signs this browser in; single use, 60 minutes |
| GET | `/api/me` | user | member |  |  | `core/me/routes.user.ts` | `{ user, memberships, uiPrefs }` for the org picker and the stored UI state ([Module contract](module-contract.md#context-endpoints), [ADR-0014](../decisions/ADR-0014-user-ui-preferences.md)) |
| PATCH | `/api/me` | user | member |  |  | `core/me/routes.user.ts` | `{ name?, locale?, uiPrefs? }`; `uiPrefs` merges key by key into the stored object; answers like GET |
| POST | `/api/public/invitations/inspect` | public | token |  | PL-01, TN-01, CR-01, CR-04 | `core/invitations/routes.public.ts` | `{ token }` → `{ orgKind, orgName, role, email, hasAccount }`; 401 when unknown, used, revoked or expired |
| POST | `/api/public/invitations/accept` | public | token |  | PL-01, TN-01, CR-01, CR-04 | `core/invitations/routes.public.ts` | Runs with the token, then in the scope of the org. `{ token, name?, password?, locale? }` → `{ orgId, orgKind }`. A user signed in with the invited email just joins. Otherwise an email with an account answers 401 with `reason: 'sign_in_required'`; a new user needs `name` and `password` (422 without) and gets a verified account and a session. Gate and dock site lists become `membership_site` rows. 409 `already_member` leaves the invitation pending. Service: `acceptInvitation` in `core/invitations/accept.redeem.ts` |
| GET | `/api/t/:orgId/context` | tenant | member |  |  | `core/context/routes.tenant.ts` | The tenant context of the signed-in member: org, role, permissions, entitlements, the visible sites and their settings. |
| GET | `/api/c/:orgId/context` | carrier | member |  |  | `core/context/routes.carrier.ts` | The carrier context of the signed-in member: org, role, permissions and linked tenants. |
| GET | `/api/platform/context` | platform | member |  |  | `core/context/routes.platform.ts` | The platform context of the signed-in platform admin. |

<!-- routes:auth-me-and-invitations:end -->

## Platform administration

Unit U3. `core/platform/routes.platform.ts`, mounted at the platform root. Schemas in `packages/shared/src/modules/core/api.platform.ts` and `api.settings.ts`.

<!-- routes:platform-administration:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/platform/tenants` | platform | `core.manage_tenants` |  | PL-01, PL-04 | `core/platform/routes.platform.ts` | One page of tenants: `{ items: [{ id, name, package, createdAt, usage }], total, page, pageSize, facets: { package: { start, pro, enterprise } } }`. Query (all optional): `q` searches the name as a case-insensitive substring, `package` filters by a comma-separated list of package ids, `sort` is `name` (default) or `createdAt`, `order` is `asc` (default) or `desc` with `id` as tiebreaker, `page` from 1 (default) to 10000, `pageSize` 10, 25 (default), 50 or 100; anything else is 422 at its path. `total` counts the tenants matching `q` and `package`; `facets.package` counts per package the tenants matching `q`, ignoring `package`. A page past the end has no items. `usage` holds one meter `{ used, limit, soft, over }` per limit, counted for the page rows only: `core.max_sites` (active sites), `core.max_docks` (active and maintenance docks), `core.max_internal_users` (members plus invitations that still work) and `booking.max_bookings_per_month` (bookings created since the first of the UTC month). `over` is `used > limit` and blocks nothing. Counted in the request transaction as the tenant with actor `system:usage` |
| POST | `/api/platform/tenants` | platform | `core.manage_tenants` |  | PL-01 | `core/platform/routes.platform.ts` | `{ name, package, adminEmail }` → 201 tenant detail. Creates org, subscription and a `tenant_admin` invitation, and enqueues `core.invitation` in the platform default locale. Service: `createTenant` in `core/platform/tenants.ts` |
| GET | `/api/platform/tenants/:tenantId` | platform | `core.manage_tenants` |  | PL-02 | `core/platform/routes.platform.ts` | `{ id, name, package, usage, entitlements: [{ key, module, kind, soft, value, source, packageValue? }], overrides: [{ key, value, expiresAt, note, active }], adminInvitations: [{ id, email, expiresAt }] }`. Reserved keys are left out; 404 for an id that is not a tenant |
| PATCH | `/api/platform/tenants/:tenantId` | platform | `core.manage_tenants` |  | PL-02 | `core/platform/routes.platform.ts` | `{ name?, package? }` → tenant detail |
| PUT | `/api/platform/tenants/:tenantId/overrides/:key` | platform | `core.manage_tenants` |  | PL-02 | `core/platform/routes.platform.ts` | `{ value, expiresAt?, note? }`, `value` a boolean, a non-negative integer or `null` (unlimited) → the override. 400 `bad_request` with `reason` `unknown_key` or `reserved_key`, then 422 on `["value"]` for a value of the wrong kind. Applies from the tenant's next request |
| DELETE | `/api/platform/tenants/:tenantId/overrides/:key` | platform | `core.manage_tenants` |  | PL-02 | `core/platform/routes.platform.ts` | 204 |
| POST | `/api/platform/tenants/:tenantId/invitations` | platform | `core.manage_tenants` |  | PL-01 | `core/platform/routes.platform.ts` | `{ email }` → 201 invitation; re-invites a tenant admin. A pending invitation to the same email is revoked and replaced |
| GET | `/api/platform/packages` | platform | `core.manage_tenants` |  | PL-02 | `core/platform/routes.platform.ts` | `{ items: [{ id, values: [{ key, module, kind, soft, value }] }] }`, read-only |
| GET | `/api/platform/settings` | platform | `core.manage_platform_settings` |  | PL-03 | `core/platform/routes.platform.ts` | `{ scope: 'platform', siteId: null, items }`: every key with platform scope, shaped as in the tenant settings read |
| PUT | `/api/platform/settings/:key` | platform | `core.manage_platform_settings` |  | PL-03 | `core/platform/routes.platform.ts` | `{ value }` → the field. 400 for an unknown key or one without platform scope; 422 with the zod path under `["value", ...]`. Tenant and site rows stay |
| DELETE | `/api/platform/settings/:key` | platform | `core.manage_platform_settings` |  | PL-03 | `core/platform/routes.platform.ts` | 204; back to the code default |

<!-- routes:platform-administration:end -->

## Tenant administration

Schemas in `packages/shared/src/modules/core/api.staff.ts`, `api.settings.ts` and `packages/shared/src/modules/brand/api.ts`.

<!-- routes:tenant-administration:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/t/:orgId/staff` | tenant | `core.manage_staff` |  | TN-01 | `core/staff/routes.tenant.ts` | `{ members: [{ membershipId, userId, name, email, role, siteIds, self }], invitations: [{ id, email, role, siteIds, expiresAt, expired }] }` |
| POST | `/api/t/:orgId/staff/invitations` | tenant | `core.manage_staff` | limit `core.max_internal_users` | TN-01 | `core/staff/routes.tenant.ts` | The limit `core.max_internal_users` counts members plus pending invitations. `{ email, role, siteIds? }` → 201 invitation. `siteIds` only for gate and dock operators (422 on `["siteIds"]` otherwise, on `["siteIds", i]` for another tenant's site). A pending invitation to the same email is replaced and does not count twice; a member's email answers 409 `conflict` `already_member` |
| DELETE | `/api/t/:orgId/staff/invitations/:invitationId` | tenant | `core.manage_staff` |  | TN-01 | `core/staff/routes.tenant.ts` | 204, the link stops working |
| PATCH | `/api/t/:orgId/staff/:membershipId` | tenant | `core.manage_staff` |  | TN-01 | `core/staff/routes.tenant.ts` | `{ role?, siteIds? }` → the member; a role without a site list drops its `membership_site` rows |
| DELETE | `/api/t/:orgId/staff/:membershipId` | tenant | `core.manage_staff` |  | TN-01 | `core/staff/routes.tenant.ts` | access ends on the member's next request |
| GET | `/api/t/:orgId/settings` | tenant | `core.manage_settings` |  | TN-02 | `core/settings/routes.tenant.ts` | `?siteId=` reads the site level, without it the tenant level: `{ scope, siteId, items: [{ key, module, scopes, value, source, inherited: { value, source } }] }` for every available key the level may hold |
| PUT | `/api/t/:orgId/settings/:key` | tenant | `core.manage_settings` |  | TN-02, TN-04 | `core/settings/routes.tenant.ts` | Needs the entitlement that the key's `requires` names. `{ siteId: uuid \| null, value }` → the field. 400 for an unknown key or a level the key lacks (`scope_not_allowed`, `allowed`), 403 `entitlement_required` with the blocking feature, 422 under `["value", ...]`, 404 for another tenant's site |
| DELETE | `/api/t/:orgId/settings/:key` | tenant | `core.manage_settings` |  | TN-02 | `core/settings/routes.tenant.ts` | `?siteId=`; "Reset to inherited" |
| GET | `/api/c/:orgId/users` | carrier | `core.manage_carrier_users` |  | CR-04 | `core/carrier-users/routes.carrier.ts` | as the staff list, without site lists |
| POST | `/api/c/:orgId/users/invitations` | carrier | `core.manage_carrier_users` |  | CR-04 | `core/carrier-users/routes.carrier.ts` | `{ email, role }` → 201; the email goes out in the inviter's locale |
| DELETE | `/api/c/:orgId/users/invitations/:invitationId` | carrier | `core.manage_carrier_users` |  | CR-04 | `core/carrier-users/routes.carrier.ts` | Revokes an invitation; the link stops working. |
| PATCH | `/api/c/:orgId/users/:membershipId` | carrier | `core.manage_carrier_users` |  | CR-04 | `core/carrier-users/routes.carrier.ts` | `{ role }` |
| DELETE | `/api/c/:orgId/users/:membershipId` | carrier | `core.manage_carrier_users` |  | CR-04 | `core/carrier-users/routes.carrier.ts` | Removes a member from the carrier. |
| GET | `/api/t/:orgId/brand/logo` | tenant | `brand.manage` | module `brand` | TN-05 | `brand/logo/routes.tenant.ts` | `{ logo: { url, contentType, byteSize, updatedAt } \| null }` |
| PUT | `/api/t/:orgId/brand/logo` | tenant | `brand.manage` | module `brand` | TN-05 | `brand/logo/routes.tenant.ts` | raw PNG or JPEG up to 256 KB, checked by magic bytes whatever the `Content-Type` → `{ logo }`. A larger body answers 422 with issue code `too_big`; SVG and anything else 422 `invalid_format` |
| DELETE | `/api/t/:orgId/brand/logo` | tenant | `brand.manage` | module `brand` | TN-05 | `brand/logo/routes.tenant.ts` | Removes the logo. |
| GET | `/api/public/logos/:tenantId/:sha` | public | none |  | TN-05 | `brand/logo/routes.public.ts` | Needs the tenant's module `brand`. The image with `Cache-Control: public, max-age=31536000, immutable`; 404 for another hash, no logo or `brand.logo` off. URLs come from `logoUrl(tenantId, sha, origin?)` in `@rampflow/shared/modules/brand/api`, or `currentLogoUrl(tx, tenantId, entitlements, origin)` in `brand/logo/logo.ts` |

<!-- routes:tenant-administration:end -->

## Master data and capacity

Unit U4.

<!-- routes:master-data-and-capacity:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/t/:orgId/sites` | tenant | member |  | MD-01 | `core/sites/routes.tenant.ts` | a site-limited operator sees only its sites; `{ items, usage: { sites, docks } }` counts active sites and active and maintenance docks against `core.max_sites` and `core.max_docks` |
| POST | `/api/t/:orgId/sites` | tenant | `core.manage_sites` | limit `core.max_sites` | MD-01, MD-05 | `core/sites/routes.tenant.ts` | seeds the three load types, imports holidays |
| GET | `/api/t/:orgId/sites/:siteId` | tenant | member |  | MD-01 | `core/sites/routes.tenant.ts` | One site of the tenant; 404 for a site of another tenant. |
| PATCH | `/api/t/:orgId/sites/:siteId` | tenant | `core.manage_sites` | limit `core.max_sites` | MD-01 | `core/sites/routes.tenant.ts` | Checks `core.max_sites` when activating. Unknown zone answers 422 |
| GET | `/api/t/:orgId/sites/:siteId/halls` | tenant | member |  | MD-02 | `core/sites/routes.tenant.ts` | The halls of a site. |
| POST | `/api/t/:orgId/sites/:siteId/halls` | tenant | `core.manage_sites` |  | MD-02 | `core/sites/routes.tenant.ts` | Adds a hall to a site. |
| PATCH | `/api/t/:orgId/sites/:siteId/halls/:hallId` | tenant | `core.manage_sites` |  | MD-02 | `core/sites/routes.tenant.ts` | Renames or reorders a hall. |
| GET | `/api/t/:orgId/sites/:siteId/docks` | tenant | member |  | MD-02 | `core/sites/routes.tenant.ts` | The docks of a site. |
| POST | `/api/t/:orgId/sites/:siteId/docks` | tenant | `core.manage_sites` | limit `core.max_docks` | MD-02 | `core/sites/routes.tenant.ts` | 409 `conflict` with reason `duplicate_code`; a hall of another site answers 422 |
| PATCH | `/api/t/:orgId/sites/:siteId/docks/:dockId` | tenant | `core.manage_sites` | limit `core.max_docks` | MD-02 | `core/sites/routes.tenant.ts` | Updates a dock. Checks `core.max_docks` when the dock leaves `inactive`. |
| GET | `/api/t/:orgId/capacity/resources` | tenant | `booking.view` |  | MD-03 | `booking/capacity/routes.tenant.ts` | optional `?siteId=` |
| POST | `/api/t/:orgId/capacity/resources` | tenant | `booking.manage_resources` |  | MD-03 | `booking/capacity/routes.tenant.ts` | Needs `booking.pools` for pools. `{ siteId, kind, name, directions, capacityCap?, dailyCap?, dockIds }` |
| PATCH | `/api/t/:orgId/capacity/resources/:resourceId` | tenant | `booking.manage_resources` |  | MD-03 | `booking/capacity/routes.tenant.ts` | Needs `booking.pools` for pools. Never cancels bookings |
| PUT | `/api/t/:orgId/capacity/resources/:resourceId/docks` | tenant | `booking.manage_resources` |  | MD-03 | `booking/capacity/routes.tenant.ts` | Needs `booking.pools` for pools. `{ dockIds }`; 409 `dock_in_resource` with `dockIds` |
| PUT | `/api/t/:orgId/capacity/docks/:dockId/booking` | tenant | `booking.manage_resources` |  | MD-03 | `booking/capacity/routes.tenant.ts` | Needs `booking.pools` when a pool is left or joined. `{ as: 'none' } \| { as: 'single', directions? } \| { as: 'pool', resourceId }` moves the dock in one transaction and answers `{ resource }` (null for `none`); a single resource whose dock leaves is deactivated and reused, with its directions unless new ones are given, when the dock is booked as single again; a new single serves both directions; idempotent |
| GET | `/api/t/:orgId/capacity/hours` | tenant | `booking.view` |  | MD-04 | `booking/capacity/routes.tenant.ts` | `?siteId=` |
| PUT | `/api/t/:orgId/capacity/hours` | tenant | `booking.manage_resources` |  | MD-04 | `booking/capacity/routes.tenant.ts` | `{ siteId, resourceId: uuid \| null, rows: [{ weekday, opens, closes }] }` |
| GET | `/api/t/:orgId/capacity/closures` | tenant | `booking.view` |  | MD-04 | `booking/capacity/routes.tenant.ts` | `?siteId=&from=&to=` |
| POST | `/api/t/:orgId/capacity/closures` | tenant | `booking.manage_resources` |  | MD-04 | `booking/capacity/routes.tenant.ts` | Adds a closure to a site or resource. |
| DELETE | `/api/t/:orgId/capacity/closures/:closureId` | tenant | `booking.manage_resources` |  | MD-04 | `booking/capacity/routes.tenant.ts` | manual closures only, a holiday answers 409 `holiday_closure`; an unknown id answers 404 |
| POST | `/api/t/:orgId/capacity/closures/:closureId/reopen` | tenant | `booking.manage_resources` |  | MD-04 | `booking/capacity/routes.tenant.ts` | holiday closures, a manual one answers 409 `manual_closure`; idempotent |
| GET | `/api/t/:orgId/capacity/load-types` | tenant | `booking.view` |  | MD-05 | `booking/capacity/routes.tenant.ts` | `?siteId=` |
| POST | `/api/t/:orgId/capacity/load-types` | tenant | `booking.manage_resources` |  | MD-05 | `booking/capacity/routes.tenant.ts` | Needs `booking.duration_rules` for tiers. Adds a load type. |
| PATCH | `/api/t/:orgId/capacity/load-types/:loadTypeId` | tenant | `booking.manage_resources` |  | MD-05 | `booking/capacity/routes.tenant.ts` | Needs `booking.duration_rules` for tiers. Updates a load type. |
| PUT | `/api/t/:orgId/capacity/load-types/:loadTypeId/resources` | tenant | `booking.manage_resources` |  | MD-05 | `booking/capacity/routes.tenant.ts` | Sets the resources that take a load type. |
| GET | `/api/t/:orgId/capacity/availability` | tenant | `booking.view` |  | MD-04, BK-02 | `booking/capacity/routes.tenant.ts` | `?siteId&date&loadTypeId&loadUnits&resourceId?`; offered starts per resource and their union (`Offers` in `api.capacity.ts`), staff view without lead time and horizon |

<!-- routes:master-data-and-capacity:end -->

Request schemas and response shapes live in `packages/shared/src/modules/core/api.sites.ts` and `packages/shared/src/modules/booking/api.capacity.ts`. Capacity writers in other units call `lockSiteCapacity`, `loadDayTimeline`, `checkFit`, `offersFor` and `isOverCapacity` from `apps/api/src/modules/booking/capacity/` ([ADR-0004](../decisions/ADR-0004-booking-capacity-concurrency.md)); `offersFor` with `audience: 'carrier'` applies `booking.min_lead_minutes` and `booking.horizon_days`.

## Safety authoring and register

Unit U5. `safety/authoring/routes.tenant.ts` and `safety/register/routes.tenant.ts`, mounted at `/safety` with `withModule(Module.safety)`. Schemas in `packages/shared/src/modules/safety/api.authoring.ts` and `api.register.ts`.

<!-- routes:safety-authoring-and-register:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/t/:orgId/safety/instructions` | tenant | `safety.manage_briefings` | module `safety` | SF-01 | `safety/authoring/routes.tenant.ts` | `{ items }` with sites, archive time, published and draft version |
| POST | `/api/t/:orgId/safety/instructions` | tenant | `safety.manage_briefings` | module `safety`; limit `safety.max_briefing_templates` | SF-01 | `safety/authoring/routes.tenant.ts` | `{ name, allSites, siteIds }`; version 1 draft from the 12-language platform template, de and en flagged `source`, the others `machine`; template questions only with `safety.quiz`; a site of another tenant answers 404 |
| PATCH | `/api/t/:orgId/safety/instructions/:instructionId` | tenant | `safety.manage_briefings` | module `safety` | SF-01 | `safety/authoring/routes.tenant.ts` | `{ name?, allSites?, siteIds?, archived? }`; `allSites` and `siteIds` change together; `archived: false` counts against the limit again |
| GET | `/api/t/:orgId/safety/instructions/:instructionId/versions` | tenant | `safety.manage_briefings` | module `safety` | SF-01 | `safety/authoring/routes.tenant.ts` | `{ items }`, newest first, with locales, translation flags and question counts |
| POST | `/api/t/:orgId/safety/instructions/:instructionId/versions` | tenant | `safety.manage_briefings` | module `safety` | SF-01 | `safety/authoring/routes.tenant.ts` | new draft copied from the latest version (201); the open draft if one exists (200); without `safety.quiz` the copy drops its questions |
| GET | `/api/t/:orgId/safety/versions/:versionId` | tenant | `safety.manage_briefings` | module `safety` | SF-01 | `safety/authoring/routes.tenant.ts` | all locales with questions, answers and content hash |
| PUT | `/api/t/:orgId/safety/versions/:versionId/content/:locale` | tenant | `safety.manage_briefings` | module `safety` | SF-01, SF-02 | `safety/authoring/routes.tenant.ts` | Needs `safety.quiz` when questions are sent. `{ title, blocks, questions, statement, translation }`; draft only, else 409 `invalid_transition` with `status`; at most 5 questions, 2 to 4 options each |
| POST | `/api/t/:orgId/safety/versions/:versionId/publish` | tenant | `safety.manage_briefings` | module `safety` | SF-01, SF-02 | `safety/authoring/routes.tenant.ts` | `{ materialChange }`; retires the previous version; with `safety.quiz`, 409 `conflict` reason `quiz_incomplete` with `locales`, `min`, `max` unless every locale has 3 to 5 questions; without it, 403 `entitlement_required` while any locale has questions; repeating it answers 200 |
| GET | `/api/t/:orgId/safety/acknowledgements/filters` | tenant | `safety.view_register` | module `safety` | SF-03 | `safety/register/routes.tenant.ts` | `{ instructions, carriers }`: every instruction (archived too) with its non-draft versions, newest first, and the carriers of the bookings that have acknowledgements; the choices of the register filters, because `safety.view_register` alone cannot list instructions |
| POST | `/api/t/:orgId/safety/acknowledgements/search` | tenant | `safety.view_register` | module `safety` | SF-03 | `safety/register/routes.tenant.ts` | `{ siteId?, carrierId?, driverName?, instructionId?, versionId?, status?, limit?, cursor? }`; newest first, paginated; `status` is `valid`, `visit_only`, `expired` or `outdated` from `acknowledgementStatus`; restricted rows (TN-06) are left out |
| POST | `/api/t/:orgId/safety/acknowledgements.csv` | tenant | `safety.view_register` | module `safety` | SF-03 | `safety/register/routes.tenant.ts` | same filters without paging, up to 50,000 rows; CSV format of [Time and formats](#time-and-formats) |

<!-- routes:safety-authoring-and-register:end -->

The register routes take their filters in a POST body, not a query string, because the driver name is a personal search term ([Requests](#requests)).

## Bookings (staff)

Unit U6a, built. `booking/staff/routes.tenant.ts`, mounted at `/bookings`. Creates, reschedules and duration-changing avis edits take the site capacity lock ([ADR-0004](../decisions/ADR-0004-booking-capacity-concurrency.md)). Request schemas and response shapes live in `packages/shared/src/modules/booking/api.staff.ts`; commands run through `transitionBooking` ([Booking lifecycle](booking-lifecycle.md)). Reads and commands answer the `BookingView` (booking, avis, safety status, driver link state).

<!-- routes:bookings-staff:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/t/:orgId/bookings/board` | tenant | `booking.view` |  | BK-01 | `booking/staff/routes.tenant.ts` | `?siteId&date`; columns per resource with `slots` (`capacity`, `booked` per grid slot) and `bookings` with `overCapacity`; polled every 15 s |
| GET | `/api/t/:orgId/bookings` | tenant | `booking.view` |  | BK-01 | `booking/staff/routes.tenant.ts` | `?siteId&date&status&limit&cursor`; list view with the same summaries, by start |
| GET | `/api/t/:orgId/bookings/carrier-options` | tenant | `booking.staff_book` and `booking.view` |  | BK-02 | `booking/staff/routes.tenant.ts` | `?q=`; actively linked carriers `{ items: [{ id, name }] }` |
| GET | `/api/t/:orgId/bookings/:bookingId` | tenant | `booking.view` |  | BK-01, BK-03 | `booking/staff/routes.tenant.ts` | booking, avis, safety status |
| GET | `/api/t/:orgId/bookings/:bookingId/events` | tenant | `booking.view` |  | YD-08 | `booking/staff/routes.tenant.ts` | `?limit&cursor`, oldest first; `actor` only with `booking.view_actors` |
| POST | `/api/t/:orgId/bookings` | tenant | `booking.staff_book` |  | BK-02, AV-01 | `booking/staff/routes.tenant.ts` | Needs `booking.force` when `force` is set. `{ clientRequestId, siteId, resourceId?, loadTypeId, startsAt, carrier: { id } \| { name }, avis, force?, forceReason? }`; 201, or 200 with the first booking for a repeated `clientRequestId`; `forceReason` required with `force` |
| PATCH | `/api/t/:orgId/bookings/:bookingId` | tenant | `booking.staff_book` |  | BK-03 | `booking/staff/routes.tenant.ts` | Needs `booking.force` when `force` is set. Reschedule `{ startsAt, resourceId?, version, force?, forceReason? }`; moves the driver link expiry to the new start plus 7 days |
| PUT | `/api/t/:orgId/bookings/:bookingId/avis` | tenant | `booking.staff_book` | `avis.basic` | AV-02 | `booking/staff/routes.tenant.ts` | `{ avis, version }`; from `checked_in` on, no capacity check |
| POST | `/api/t/:orgId/bookings/:bookingId/cancel` | tenant | `booking.staff_book` |  | BK-03 | `booking/staff/routes.tenant.ts` | `{ reason? }` (send `{}` without one) |
| GET | `/api/t/:orgId/bookings/:bookingId/driver-link` | tenant | `booking.staff_book` |  | CR-06 | `booking/staff/routes.tenant.ts` | `{ url, expiresAt }`; 404 once the link is revoked |
| POST | `/api/t/:orgId/bookings/:bookingId/driver-link` | tenant | `booking.staff_book` |  | CR-06 | `booking/staff/routes.tenant.ts` | regenerate; answers the new `{ url, expiresAt }` |
| POST | `/api/t/:orgId/bookings/:bookingId/driver-link/email` | tenant | `booking.staff_book` | `notify.email` | CR-06 | `booking/staff/routes.tenant.ts` | `{ email, locale }`; 202 |

<!-- routes:bookings-staff:end -->

## Carrier network

Unit U7. Router files in `apps/api/src/modules/booking/{carriers,registration}/`; shapes in `packages/shared/src/modules/booking/api.carriers.ts`.

<!-- routes:carrier-network:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/t/:orgId/carriers` | tenant | `booking.manage_carriers` |  | TN-03 | `booking/carriers/routes.tenant.ts` | `{ links, invitations }`: linked carriers with name, country, status and source, and invitations neither accepted nor revoked |
| POST | `/api/t/:orgId/carriers/invitations` | tenant | `booking.manage_carriers` | `booking.carrier_portal` | TN-03 | `booking/carriers/routes.tenant.ts` | `{ companyName, email, locale? }` → 201; emails `booking.carrier-invitation` in `locale` (default the inviter's). A pending invitation for the same email is revoked, so inviting again resends |
| DELETE | `/api/t/:orgId/carriers/invitations/:invitationId` | tenant | `booking.manage_carriers` |  | TN-03 | `booking/carriers/routes.tenant.ts` | 204, also when nothing matched |
| GET | `/api/t/:orgId/carriers/registrations` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | `booking/carriers/routes.tenant.ts` | `{ items }`, newest first, every status; each item carries the typed `companyName` and `carrierName`, the org verification bound (null before verification) |
| POST | `/api/t/:orgId/carriers/registrations/:registrationId/approve` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | `booking/carriers/routes.tenant.ts` | links the carrier (reactivating a deactivated link), emails `booking.registration-approved`; 409 `invalid_transition` with `status` unless `pending_approval` |
| POST | `/api/t/:orgId/carriers/registrations/:registrationId/reject` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | `booking/carriers/routes.tenant.ts` | `{ reason }`, emails `booking.registration-rejected`; 409 as for approve |
| GET | `/api/t/:orgId/carriers/public-links` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | `booking/carriers/routes.tenant.ts` | `{ items }`: per site the slug (or `null`), `enabled` (`booking.public_link_enabled`) and `mode` (`booking.public_registration_mode`) |
| POST | `/api/t/:orgId/carriers/public-links` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | `booking/carriers/routes.tenant.ts` | `{ siteId }`; 201 when it creates the site's slug, 200 with the existing one; 404 for a site of another tenant |
| POST | `/api/t/:orgId/carriers/public-links/:siteId/regenerate` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | `booking/carriers/routes.tenant.ts` | revokes the slug and issues a new one, for a link that leaked |
| PATCH | `/api/t/:orgId/carriers/:carrierId` | tenant | `booking.manage_carriers` |  | TN-03 | `booking/carriers/routes.tenant.ts` | `{ status: 'active' \| 'deactivated' }`; 404 without a link |
| GET | `/api/c/:orgId/tenants` | carrier | member |  | CR-02, CR-05 | `booking/carriers/routes.carrier.ts` | `{ items }`: every tenant the carrier is linked to or registered at, with `link` (status, since) and the newest `registration` (status, reject reason) |
| POST | `/api/public/carrier-invitations/inspect` | public | token |  | TN-03, CR-01 | `booking/carriers/routes.public.ts` | `{ token }` → `{ tenantName, logoUrl, companyName, email, hasAccount }`; `logoUrl` as for `/api/public/links/:slug` |
| POST | `/api/public/carrier-invitations/accept` | public | token |  | TN-03, CR-01 | `booking/carriers/routes.public.ts` | Runs with the token, then in the scope of the user. `{ token, name?, password?, companyName?, locale? }` → `{ carrierId }`. A new user needs `name` and `password` (422 without) and becomes carrier admin of a new org; a user signed in with the invited email links the carrier org they administer, and one who is only `carrier_user` answers 403 `forbidden` with `reason: 'carrier_admin_required'` and leaves the invitation pending; an email with an account answers 401 `sign_in_required` with `email`. The link is active, also when the tenant deactivated it before sending this invitation; a deactivation after it stays. Single use, 7 days. Service: `acceptCarrierInvitation` in `accept.redeem.ts` |
| GET | `/api/public/links/:slug` | public | none |  | CR-02, TN-04 | `booking/registration/routes.public.ts` | Needs the tenant's `booking.public_link` and the site's `booking.public_link_enabled`. `{ tenantName, siteName, city, country, logoUrl }` (`logoUrl` is `null` without a logo or while `brand.logo` is off). 404 for an unknown or revoked slug, the feature or the site setting off, or an inactive site. The setting is the only on and off switch; the slug only names the link |
| POST | `/api/public/links/:slug/registrations` | public | none |  | CR-02 | `booking/registration/routes.public.ts` | Needs the tenant's `booking.public_link` and the site's `booking.public_link_enabled`. `{ companyName, country, contactName, email, locale? }`; always 202 with an empty body. A known email gets a sign-in prompt by email instead of the verification text, both with the single-use `/carrier-registration#<token>` link, so the response never reveals an account. Limits `registration_request` (5 per hour per email) and `registration_ip` (100 per hour per client address); over either the answer is the same 202 and nothing is written |
| POST | `/api/public/registrations/verify` | public | token |  | CR-02 | `booking/registration/routes.public.ts` | `{ token }` → `{ carrierId, status }`; verifies the email, signs in, applies `booking.public_registration_mode`. A new email gets a verified account without password and a new carrier org; a known email answers 401 `sign_in_required` with `email` until that user is signed in, then attaches to the carrier org they administer; a user who is only `carrier_user` somewhere answers 403 `forbidden` with `reason: 'carrier_admin_required'` and the registration stays unverified. `auto_approve` links at once but leaves a link the tenant deactivated off. Single use, 24 hours; 401 once the site switched the public link off, the feature or site is off, or the slug the form came through was regenerated. Service: `verifyRegistration` in `verify.redeem.ts` |

<!-- routes:carrier-network:end -->

`assertActiveLink(tx, tenantId, carrierId)` in `booking/carriers/links.ts` throws 403 `forbidden` with `reason: 'link_inactive'` unless the link is active. Booking creation and reschedules call it (U8); reads and cancel do not, so a deactivated carrier keeps seeing its bookings.

## Carrier booking portal

Unit U8, built. Carrier reads in `booking/portal/routes.carrier.ts` at `/api/c/:orgId/bookings` (party `carrier`, every tenant the carrier has bookings at); writes and the wizard's reads in `booking/portal/routes.carrier-at-tenant.ts` at `/api/c/:orgId/at/:tenantId` (party `carrier_at_tenant`). Request schemas and response shapes live in `packages/shared/src/modules/booking/api.portal.ts`. Every `at` route needs an active link (else 403 `forbidden`, reason `link_inactive`), except `cancel`, which a deactivated link still allows. Another carrier's booking, at the same tenant or not, answers 404.

Bookings answer `PortalBookingView`: the summary (tenant, site, slot with `timeZone`, load type, load units, plate, first reference, `checkedInAt`, `departedAt`, `cutoffAt`, `version`) plus the site's address and phone, `linkActive`, dock code, the visit timestamps, the avis, the safety status, the driver link state and the events without actors. `cutoffAt` is `startsAt - booking.cancel_cutoff_minutes` of the booking's site. Offers answer `PortalOffers`: the site's offered starts of one day with `durationMinutes`, without the resources, which stay internal; a 409 with `offers` carries the same shape.

<!-- routes:carrier-booking-portal:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/c/:orgId/bookings` | carrier | `booking.view` |  | CR-05 | `booking/portal/routes.carrier.ts` | all tenants; `?tenantId&siteId&from&to&status&when&order&limit&cursor`; `from` and `to` are site-local dates of each booking's start; `when=upcoming` keeps trucks on site and requested or confirmed bookings starting today or later in site time, `when=past` keeps the rest (every final booking, and pending ones from earlier days); `order` is `asc` (default, by start) or `desc` (the past, newest first); `{ items: PortalBookingSummary[], nextCursor }` |
| GET | `/api/c/:orgId/bookings/:bookingId` | carrier | `booking.view` |  | CR-05 | `booking/portal/routes.carrier.ts` | `PortalBookingView` |
| GET | `/api/c/:orgId/bookings/:bookingId/driver-link` | carrier | `booking.book` |  | CR-06 | `booking/portal/routes.carrier.ts` | `{ url, expiresAt }`; 404 without an active link |
| GET | `/api/c/:orgId/bookings/:bookingId/rebook` | carrier | `booking.book` |  | BK-06 | `booking/portal/routes.carrier.ts` | `{ tenantId, siteId, loadTypeId, avis }`: the avis without references and driver; no date |
| GET | `/api/c/:orgId/at/:tenantId/sites` | carrier_at_tenant | `booking.book` | `booking.carrier_portal` | BK-04 | `booking/portal/routes.carrier-at-tenant.ts` | `{ items }`: active sites with address, phone, `timeZone`, `cutoffMinutes`, `leadMinutes`, `horizonDays` and `avisRules` |
| GET | `/api/c/:orgId/at/:tenantId/load-types` | carrier_at_tenant | `booking.book` | `booking.carrier_portal` | BK-04 | `booking/portal/routes.carrier-at-tenant.ts` | `?siteId=`; active, carrier-bookable only: `{ items: [{ id, name, direction }] }` |
| GET | `/api/c/:orgId/at/:tenantId/availability` | carrier_at_tenant | `booking.book` | `booking.carrier_portal` | BK-04 | `booking/portal/routes.carrier-at-tenant.ts` | `?siteId&loadTypeId&date&loadUnits`; `PortalOffers` with lead time and horizon applied; 404 for a load type carriers cannot book |
| POST | `/api/c/:orgId/at/:tenantId/bookings` | carrier_at_tenant | `booking.book` | `booking.carrier_portal` | BK-04, AV-01 | `booking/portal/routes.carrier-at-tenant.ts` | `{ clientRequestId, siteId, loadTypeId, startsAt, avis }`; 201 `PortalBookingView`, 200 for a repeated `clientRequestId`; 409 with `offers` when the last unit went elsewhere |
| PATCH | `/api/c/:orgId/at/:tenantId/bookings/:bookingId` | carrier_at_tenant | `booking.book` | `booking.carrier_portal` | BK-05 | `booking/portal/routes.carrier-at-tenant.ts` | `{ startsAt, version }`; before the cutoff, else 409 `cutoff_passed` |
| POST | `/api/c/:orgId/at/:tenantId/bookings/:bookingId/cancel` | carrier_at_tenant | `booking.book` | `booking.carrier_portal` | BK-05 | `booking/portal/routes.carrier-at-tenant.ts` | `{ reason? }`; before the cutoff; revokes the driver link |
| PUT | `/api/c/:orgId/at/:tenantId/bookings/:bookingId/avis` | carrier_at_tenant | `booking.book` | `avis.basic` | AV-02 | `booking/portal/routes.carrier-at-tenant.ts` | `{ avis, version }`; before the cutoff; 409 when the new duration does not fit, and the avis stays |
| POST | `/api/c/:orgId/at/:tenantId/bookings/:bookingId/driver-link` | carrier_at_tenant | `booking.book` |  | CR-06 | `booking/portal/routes.carrier-at-tenant.ts` | regenerate; `{ url, expiresAt }` |
| POST | `/api/c/:orgId/at/:tenantId/bookings/:bookingId/driver-link/email` | carrier_at_tenant | `booking.book` | `notify.email` | CR-06 | `booking/portal/routes.carrier-at-tenant.ts` | `{ email, locale }` with one of the 12 driver locales; 202 |

<!-- routes:carrier-booking-portal:end -->

## Yard

Unit U9, built. `yard/routes.tenant.ts`, mounted at `/yard` with `withModule(Module.yard)` (`yard.checkin_qr`). Request schemas and response shapes live in `packages/shared/src/modules/yard/api.ts`; commands run through `transitionBooking` ([Booking lifecycle](booking-lifecycle.md)). Lists and commands answer `YardTruck`: carrier, plate (seen at the gate, else announced), driver phone, load type, load units, resource, slot, safety status, punctuality, dock with code and hall, the visit timestamps, `since` (when the current status began) and `version`. Every route is site-scoped: an operator of another site gets 404.

<!-- routes:yard:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/t/:orgId/yard/expected` | tenant | `yard.gate` | module `yard` | YD-01 | `yard/routes.tenant.ts` | `?siteId&date?` (`date` defaults to today at the site); `{ siteId, date, timeZone, items }` by start: the day's bookings except cancelled and requested ones, plus no-shows whose `no_show_at` falls on that day. Before check-in, `punctuality` is what a check-in now would record |
| POST | `/api/t/:orgId/yard/search` | tenant | `yard.gate` | module `yard` | YD-01 | `yard/routes.tenant.ts` | `{ siteId, q }` (2 to 120 characters); exact booking code (case and surrounding whitespace ignored, so scanner input works), plate announced or seen (normalized), exact reference, or part of the carrier name; active visits and today's no-shows, nearest start first, at most 20 |
| GET | `/api/t/:orgId/yard/on-site` | tenant | `yard.gate` | module `yard` | YD-04 | `yard/routes.tenant.ts` | `?siteId`; trucks in `checked_in` to `done`, whatever day they were booked for, by gate-in; each with `onSiteMinutes`, `waitMinutes` (from `max(checked_in_at, starts_at)` to the first dock timestamp, or to now) and `standgeld` (`onSiteMinutes` above `yard.standgeld_flag_minutes`) |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/check-in` | tenant | `yard.gate` | module `yard` | YD-02 | `yard/routes.tenant.ts` | `{ plateSeen? }`; 409 `safety_missing` under enforcement; the truck shows `safety.status = 'missing'` as a warning otherwise |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/turn-away` | tenant | `yard.gate` | module `yard` | YD-02 | `yard/routes.tenant.ts` | `{ reason }` from the turn-away list; from `confirmed`, `no_show` or `checked_in` |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/depart` | tenant | `yard.gate` | module `yard` | YD-05 | `yard/routes.tenant.ts` | `{ reason? }`; 422 without a reason before `done` |
| POST | `/api/t/:orgId/yard/walk-ins` | tenant | `yard.gate` and `booking.walk_in` | module `yard` | YD-03 | `yard/routes.tenant.ts` | `{ clientRequestId, siteId, resourceId?, loadTypeId, carrier: { id } \| { name }, plateSeen, outcome: 'check_in', avis }` or `{ ..., outcome: 'turn_away', avis?, reason }`. Starts at the grid slot containing now; never 409 for hours or capacity. 201 with `{ truck, safety }`: the truck in `checked_in` or `turned_away`, or in `confirmed` with `safety: 'missing'` when enforcement blocks the check-in; 200 with the first booking for a repeated `clientRequestId`. 422 on `loadTypeId` when no active resource takes the load type |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/acknowledgement-candidates` | tenant | `yard.gate` | module `yard`; module `safety` | YD-02 | `yard/routes.tenant.ts` | `{ name }` (part of the driver name, at least 2 characters); `{ items }` of the tenant's acknowledgements of instructions that apply to the site and would be valid for this visit, newest first, at most 20; 409 `invalid_transition` once the visit cannot take a briefing |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/acknowledgements` | tenant | `yard.gate` | module `yard`; module `safety` | YD-02 | `yard/routes.tenant.ts` | `{ acknowledgementId }`; `link_acknowledgement` with `via: 'gate_lookup'`; 409 `acknowledgement_invalid` |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/briefing-session` | tenant | `yard.gate` | module `yard`; module `safety` | YD-02 | `yard/routes.tenant.ts` | no body; issues a 30-minute `staff` driver access and returns `{ url, expiresAt }` |
| GET | `/api/t/:orgId/yard/docks` | tenant | `yard.call` | module `yard`; `yard.call_to_dock` | YD-06 | `yard/routes.tenant.ts` | `?siteId`; `{ halls: [{ id, name, docks: [{ id, code, status, temperatureZone, adrAllowed, resourceId, occupant }] }], queue }`; inactive docks left out, maintenance docks kept; the queue holds `checked_in` trucks by slot start, with waits |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/call` | tenant | `yard.call` | module `yard`; `yard.call_to_dock` | YD-07 | `yard/routes.tenant.ts` | `{ dockId }`; `{ truck, outsideResource }`; 409 `dock_occupied`, 409 `dock_inactive`; from `called` a reassignment |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/uncall` | tenant | `yard.call` | module `yard`; `yard.call_to_dock` | YD-07 | `yard/routes.tenant.ts` | back to `checked_in`; frees the dock |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/dock` | tenant | `yard.dock` | module `yard`; `yard.call_to_dock` | YD-08 | `yard/routes.tenant.ts` | `{ dockId? }`; 422 without a dock when none is assigned |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/loading` | tenant | `yard.dock` | module `yard`; `yard.call_to_dock` | YD-08 | `yard/routes.tenant.ts` | `{ dockId? }`, as `dock` |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/complete` | tenant | `yard.dock` | module `yard`; `yard.call_to_dock` | YD-08 | `yard/routes.tenant.ts` | `{ actualLoadUnits, discrepancyNote? }` |

<!-- routes:yard:end -->

The driver view reads the called dock from `booking.dock_id`, which `call` sets and `uncall` clears; its code and hall name come from `dock` and `hall` (DR-03). The event log of a visit is `GET /api/t/:orgId/bookings/:bookingId/events` (YD-08).

## Driver

Unit U10, built. Response shapes and request schemas live in `packages/shared/src/modules/driver/api.ts` (`ExchangeBody`, `DriverBookingView`) and `packages/shared/src/modules/safety/api.driver.ts` (briefing list, content, attempt and acknowledgement). No answer of these routes carries the driver's name, phone or plate, and none carries a token ([ADR-0008](../decisions/ADR-0008-driver-token-pwa-delivery.md)).

<!-- routes:driver:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| DELETE | `/api/driver/session` | driver | driver |  | DR-01 | `driver/session/routes.driver.ts` | 204, clears the cookie |
| POST | `/api/public/driver-session` | public | token |  | DR-01 | `driver/session/routes.public.ts` | `{ token }`; 204 and `rf_driver=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/driver; Max-Age=<seconds to the link's expiry>`; unknown, expired and revoked tokens answer the same 401 `unauthorized`; every call counts against `driver_exchange` (10 per minute per IP, 429 `rate_limited`); sets `driver_access.last_used_at` |
| GET | `/api/driver/booking` | driver | driver |  | DR-01, DR-03, SF-04 | `driver/view/routes.driver.ts` | `DriverBookingView`: `asOf`, `channel`, tenant name and logo URL, site name, address lines, map link, zone and phone, code, status, slot and check-in and call instants, `dock` (`{ code, hall }` while called, at the dock or loading), safety `{ status, validUntil }`, `privacyNoticeUrl`, `linkExpiresAt`; polled every 15 s; writes nothing |
| GET | `/api/driver/briefings` | driver | driver | module `safety` | SF-04 | `safety/driver/routes.driver.ts` | at `/briefings`; on a `link` session with an `rf_device` cookie it first links this phone's valid passes at the tenant to the booking (`link_acknowledgement` via `pass`) for instructions still missing; then `{ items: [{ instructionId, name, status, expiresAt, quiz, locales }] }` |
| GET | `/api/driver/briefings/:instructionId` | driver | driver | module `safety` | SF-04, DR-02 | `safety/driver/routes.driver.ts` | `?locale=`; the published version in that locale, else en, else its first locale; `{ instructionId, version, locale, translation, title, blocks, questions, statement }`; questions without answers, and none while `safety.quiz` is off; 404 for an instruction that does not apply to the booking's site |
| POST | `/api/driver/briefings/:instructionId/attempts` | driver | driver | module `safety`; `safety.quiz` | SF-04, SF-02 | `safety/driver/routes.driver.ts` | `{ locale, answers: { <questionId>: <option index> } }` → `{ score, passed, attempts, wrong }`; passes at `safety.quiz_pass_percent`; counts every attempt in `safety_attempt` per booking and version; the latest attempt decides |
| POST | `/api/driver/briefings/:instructionId/acknowledgement` | driver | driver | module `safety` | SF-04 | `safety/driver/routes.driver.ts` | `{ locale, name, confirmed: true }` → 201 `{ expiresAt }`; with a quiz and `safety.quiz` on, 409 `conflict` reason `quiz_not_passed` until the latest attempt passed; stores the acknowledgement through `recordAcknowledgement` with the session's channel, links it (`link_acknowledgement` via `completed`); on a `link` session with an expiry it sets `rf_device` (one year, `Path=/api/driver`) when absent and upserts the `safety_pass`; a `staff` session (gate device, YD-02) never does |

<!-- routes:driver:end -->

The exchange has an account case with credential `none`: the harness's `token` credential refuses a driver token as a wrong party, which is this route's only valid token. `driver/session/session.test.ts` covers unknown, expired and revoked tokens and the limit.

## Reports

Unit U11. `report/kpi/routes.tenant.ts`, mounted at `/reports` with `withModule(Module.report)`.

<!-- routes:reports:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/t/:orgId/reports/kpis` | tenant | `report.view` | module `report` | RP-01 | `report/kpi/routes.tenant.ts` | `?siteId&from&to&resourceId?&carrierId?`; dates are site-local |
| GET | `/api/t/:orgId/reports/kpis.csv` | tenant | `report.view` | module `report`; `report.export` | RP-02 | `report/kpi/routes.tenant.ts` | The KPI report of `GET /reports/kpis` as CSV, with the same filter. |
| GET | `/api/t/:orgId/reports/visits` | tenant | `report.view` | module `report` | RP-02 | `report/kpi/routes.tenant.ts` | paginated visit list with all timestamps |
| GET | `/api/t/:orgId/reports/visits.csv` | tenant | `report.view` | module `report`; `report.export` | RP-02 | `report/kpi/routes.tenant.ts` | Every visit in the filter as CSV, with the timestamps in the time zone of the site. |

<!-- routes:reports:end -->

As built (U11):

- Request and response shapes live in `packages/shared/src/modules/report/api.ts` (`ReportFilter`, `VisitQuery`, `KPIS`, `KpiReport`, `VisitItem`). A period runs from `from` to `to`, both site-local days included, at most 366 days; a reversed or longer period answers 422 with path `["to"]`.
- `GET /kpis` answers `{ site, from, to, standgeldMinutes, kpis }`. `kpis` has one entry per row of `KPIS` (`bookingsDue`, `noShowRate`, `lateCancellationRate`, `onTimeRate`, `earlyRate`, `lateRate`, `waitMinutes`, `dockDwellMinutes`, `turnaroundMinutes`, `dockUtilisation`, `portalAdoption`, `standgeldVisits`): rates in percent and means in minutes, rounded to one decimal half away from zero, `null` for an empty denominator.
- A `siteId` the caller cannot see, or a `resourceId` of another site, answers 404.
- `GET /visits` answers `{ site, items, nextCursor }`, ordered by `starts_at`, with every lifecycle timestamp and the visit's wait, dock dwell and turnaround in minutes. `limit` and `cursor` travel in the query string.
- The CSV routes take the filter of `GET /kpis`. The language is the user's `locale`, else the tenant's `i18n.default_locale`. Decimals use `,` for de and pl and `.` for en. The KPI CSV has one row per KPI with the columns site, from, to, KPI, value and unit. The visit CSV holds at most 50,000 rows and no personal data.

## Privacy

Unit U11. `privacy/requests/routes.tenant.ts`, mounted at `/privacy`.

<!-- routes:privacy:start -->

| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |
|---|---|---|---|---|---|---|---|
| POST | `/api/t/:orgId/privacy/search` | tenant | `privacy.manage_requests` |  | TN-06 | `privacy/requests/routes.tenant.ts` | `{ name?, phone?, plate? }`; matching bookings and acknowledgements |
| POST | `/api/t/:orgId/privacy/export` | tenant | `privacy.manage_requests` |  | TN-06 | `privacy/requests/routes.tenant.ts` | The body of `POST /privacy/search`; JSON download |
| POST | `/api/t/:orgId/privacy/erase` | tenant | `privacy.manage_requests` |  | TN-06 | `privacy/requests/routes.tenant.ts` | The body of `POST /privacy/search` plus `{ confirm: true }`; pseudonymizes bookings, restricts acknowledgements under retention |

<!-- routes:privacy:end -->

As built (U11):

- Shapes live in `packages/shared/src/modules/privacy/api.ts` (`SubjectQuery`, `EraseRequest`, `SubjectMatches`, `EraseResult`). At least one identifier is required, else 422 with path `["name"]`. Blank fields count as absent.
- Matching is exact, and any one identifier is enough. The name matches whole and case-insensitively against `avis.driver_name` and `safety_acknowledgement.driver_name`. The phone and the plate are normalized like the avis (E.164; uppercase without separators). The plate matches `plate`, `trailer_plate` and `plate_seen`. Acknowledgements linked to a matched booking match too. Pseudonymized rows no longer match. Restricted acknowledgements still match.
- `search` answers `{ bookings, acknowledgements }`, at most 500 of each. Each acknowledgement carries `restrictedAt` and `retentionEnded`.
- `export` answers the same body plus `exportedAt`, with `Content-Disposition: attachment`.
- `erase` answers `{ pseudonymizedBookings, restrictedAcknowledgements, pseudonymizedAcknowledgements }`. Acknowledgements past `privacy.retention.safety_after_expiry_days` are pseudonymized, and the others are restricted.
- `export` and `erase` write one `privacy_request_log` row with the counts. `search` writes none.

## Test routes

Unit U1. `apps/api/src/kernel/test-routes.ts`, only with `ENABLE_TEST_ROUTES=1`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/test/seed` | `{ scenario: 'world' }`; 201 with the `world()` fixture: tenant, site, carrier and booking ids, a session token per role (`rf_session`) and a driver token per booking (`rf_driver`). Seeds as the owner role through `MIGRATION_DATABASE_URL`. Passwords arrive with U2 |
| POST | `/api/test/clock` | `{ now: string \| null }`; pins the clock of requests and in-process jobs to an instant, `null` returns to the system clock; answers `{ now }` |
| POST | `/api/test/jobs/:name/run` | runs one job tick now; answers `{ ran, stats }` (`ran: false` when another runner holds the job) |

Test routes sit under the Origin check like every mutating route, so Playwright sends `Origin: APP_ORIGIN`.
