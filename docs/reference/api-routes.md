---
title: API routes
description: API conventions (areas, auth, error envelope and codes, validation, pagination, idempotency, concurrency, time and CSV formats) and the route map per module with party, permission, entitlement, story IDs, router file and owning unit.
type: reference
audience: [agent, developer]
tags: [api, routes, errors, tenancy, entitlements, permissions]
status: draft
updated: 2026-10-19
related: [docs/reference/module-contract.md, docs/reference/booking-lifecycle.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md, docs/decisions/ADR-0011-frontend-routes-and-org-context.md]
---

# API routes

Hono 4 on `/api`. The web app calls it through the `hc` client typed by `AppType`; request and response schemas live in `packages/shared/src/modules/<module>/api.<area>.ts`.

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
| `/api/test` | none | mounted only when `ENABLE_TEST_ROUTES=1`; startup fails if that is set with `NODE_ENV=production` |

- A failed membership or link check answers 404 `not_found`, so a foreign org id reveals nothing.
- Router files are `apps/api/src/modules/<module>/<area>/routes.<party>.ts`. Each mounts at the prefix its section below names, inside its party prefix. Routers of modules that can be off are wrapped with `withModule(id, ...)`, which needs a non-root prefix so its middleware stays inside that router.
- In the tables, **Permission** `member` means any member of the org; `driver` means a valid driver cookie; `token` means a valid token in the body.

### Requests

- JSON bodies with `Content-Type: application/json`. Exceptions: `PUT /brand/logo` takes the raw image body, and `*.csv` routes return `text/csv`.
- Mutating requests need `Origin` equal to `APP_ORIGIN`, else 403 `forbidden` ([ADR-0003](../decisions/ADR-0003-authentication-self-built-sessions.md)).
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

`zValidator(target, schema, onInvalid)` validates `param`, `query` and `json`. `onInvalid` maps `param` failures to 404 and `query` and `json` failures to 422 with zod paths. Business rules that need data (capacity, cutoff, limits) answer 409.

### Pagination

Lists that grow without bound (bookings, visits, acknowledgements, events) are cursor-paginated: `?limit=50&cursor=<opaque>` returns `{ items, nextCursor: string | null }`. `limit` is 1 to 200, default 50. The cursor encodes the sort key and the id. Master-data lists (sites, docks, resources, load types, staff) return `{ items }` without paging.

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

Routes under `/api/me`, `/api/auth` and `/api/public` take no org id. Each has an account case (`defineAccountCases` in the same `route-cases.ts`, exported as `accountCases`) with its credential: `session`, `token` or `none`. The harness checks that a session route answers 401 without a session and with a driver cookie, and shows the same role in world B nothing of world A; that a token route answers 401 for an unknown token, a driver token and a token of another purpose, even with a session, and for a single-use token the second time; and that every control answer shows nothing of world B. `route-coverage.test.ts` fails for a route under these prefixes without an account case.

## Auth, me and invitations

Unit U2. Router files in `apps/api/src/modules/core/`.

| Method | Path | Party | Permission | Story | Notes |
|---|---|---|---|---|---|
| GET | `/api/health` | none | none | | U1 |
| POST | `/api/auth/login` | anonymous | none | CR-03 | `{ email, password }` → 200 `{ ok }`; sets `rf_session`. A wrong password, an unknown, unverified or disabled email all answer the same 401; 429 `rate_limited` after 5 failures in 15 minutes for the email and client address |
| POST | `/api/auth/logout` | user | member | CR-03 | 204; deletes the session and clears the cookie |
| POST | `/api/auth/magic-link` | anonymous | none | CR-03 | `{ email, locale? }`; 202. Sends only to verified, enabled accounts, in `locale` (the page's language, default `de`); stops sending after 5 per hour per email |
| POST | `/api/auth/magic-link/exchange` | anonymous | token | CR-03 | `{ token }` → 200 `{ ok }`; sets `rf_session`; single use, 15 minutes |
| POST | `/api/auth/password-reset` | anonymous | none | CR-03 | `{ email, locale? }`; 202, as for the magic link (unverified accounts included) |
| POST | `/api/auth/password-reset/confirm` | anonymous | token | CR-03 | `{ token, password }` → 200 `{ ok }`; sets the password, verifies the email, deletes every session of the user and signs this browser in; single use, 60 minutes |
| GET | `/api/me` | user | member | | `{ user, memberships }` for the org picker ([Module contract](module-contract.md#context-endpoints)) |
| PATCH | `/api/me` | user | member | | `{ name?, locale? }`; answers like GET |
| POST | `/api/public/invitations/inspect` | token | token | PL-01, TN-01, CR-01, CR-04 | `{ token }` → `{ orgKind, orgName, role, email, hasAccount }`; 401 when unknown, used, revoked or expired |
| POST | `/api/public/invitations/accept` | token, then the org | token | PL-01, TN-01, CR-01, CR-04 | `{ token, name?, password?, locale? }` → `{ orgId, orgKind }`. A user signed in with the invited email just joins. Otherwise an email with an account answers 401 with `reason: 'sign_in_required'`; a new user needs `name` and `password` (422 without) and gets a verified account and a session. Gate and dock site lists become `membership_site` rows. 409 `already_member` leaves the invitation pending. Service: `acceptInvitation` in `core/invitations/accept.redeem.ts` |
| GET | `/api/t/:orgId/context` | tenant | member | | `core/context/routes.tenant.ts` |
| GET | `/api/c/:orgId/context` | carrier | member | | `core/context/routes.carrier.ts` |
| GET | `/api/platform/context` | platform | member | | `core/context/routes.platform.ts` |

## Platform administration

Unit U3. `core/platform/routes.platform.ts`, mounted at the platform root.

| Method | Path | Permission | Story | Notes |
|---|---|---|---|---|
| GET | `/api/platform/tenants` | `core.manage_tenants` | PL-01, PL-04 | each with package, sites, docks, internal users and bookings this month against limits; soft limits above 100% flagged |
| POST | `/api/platform/tenants` | `core.manage_tenants` | PL-01 | `{ name, package, adminEmail }`; creates org, subscription and `tenant_admin` invitation |
| GET | `/api/platform/tenants/:tenantId` | `core.manage_tenants` | PL-02 | resolved entitlements with sources, overrides with expiry |
| PATCH | `/api/platform/tenants/:tenantId` | `core.manage_tenants` | PL-02 | `{ name?, package? }` |
| PUT | `/api/platform/tenants/:tenantId/overrides/:key` | `core.manage_tenants` | PL-02 | `{ value, expiresAt, note }`; 400 for unknown or reserved keys, 422 for a value of the wrong kind |
| DELETE | `/api/platform/tenants/:tenantId/overrides/:key` | `core.manage_tenants` | PL-02 | |
| POST | `/api/platform/tenants/:tenantId/invitations` | `core.manage_tenants` | PL-01 | re-invite a tenant admin |
| GET | `/api/platform/packages` | `core.manage_tenants` | PL-02 | the three packages, read-only |
| GET | `/api/platform/settings` | `core.manage_platform_settings` | PL-03 | every key with platform scope: value and source |
| PUT | `/api/platform/settings/:key` | `core.manage_platform_settings` | PL-03 | `{ value }`; 422 with zod path |
| DELETE | `/api/platform/settings/:key` | `core.manage_platform_settings` | PL-03 | back to the code default |

## Tenant administration

| Method | Path | Permission | Entitlement | Story | Router (unit) |
|---|---|---|---|---|---|
| GET | `/api/t/:orgId/staff` | `core.manage_staff` | | TN-01 | `core/staff/routes.tenant.ts` (U3) |
| POST | `/api/t/:orgId/staff/invitations` | `core.manage_staff` | limit `core.max_internal_users` (members plus pending invitations) | TN-01 | same |
| DELETE | `/api/t/:orgId/staff/invitations/:invitationId` | `core.manage_staff` | | TN-01 | same |
| PATCH | `/api/t/:orgId/staff/:membershipId` | `core.manage_staff` | | TN-01 | same; `{ role?, siteIds? }` |
| DELETE | `/api/t/:orgId/staff/:membershipId` | `core.manage_staff` | | TN-01 | same; access ends on the member's next request |
| GET | `/api/t/:orgId/settings` | `core.manage_settings` | | TN-02 | `core/settings/routes.tenant.ts` (U3); `?siteId=`: per available key the effective value, its source and the inherited value |
| PUT | `/api/t/:orgId/settings/:key` | `core.manage_settings` | the key's `requires` | TN-02, TN-04 | same; `{ siteId: uuid \| null, value }` |
| DELETE | `/api/t/:orgId/settings/:key` | `core.manage_settings` | | TN-02 | same; `?siteId=`; "Reset to inherited" |
| GET | `/api/t/:orgId/brand/logo` | `brand.manage` | module `brand` | TN-05 | `brand/logo/routes.tenant.ts` (U3) |
| PUT | `/api/t/:orgId/brand/logo` | `brand.manage` | module `brand` | TN-05 | raw PNG or JPEG up to 256 KB, checked by magic bytes; SVG answers 422 |
| DELETE | `/api/t/:orgId/brand/logo` | `brand.manage` | module `brand` | TN-05 | |
| GET | `/api/public/logos/:tenantId/:sha` | public | module `brand` | TN-05 | `brand/logo/routes.public.ts` (U3); immutable cache headers |
| GET | `/api/c/:orgId/users` | `core.manage_carrier_users` | | CR-04 | `core/carrier-users/routes.carrier.ts` (U3) |
| POST | `/api/c/:orgId/users/invitations` | `core.manage_carrier_users` | | CR-04 | same; `{ email, role }` |
| DELETE | `/api/c/:orgId/users/invitations/:invitationId` | `core.manage_carrier_users` | | CR-04 | same |
| PATCH | `/api/c/:orgId/users/:membershipId` | `core.manage_carrier_users` | | CR-04 | same |
| DELETE | `/api/c/:orgId/users/:membershipId` | `core.manage_carrier_users` | | CR-04 | same |

## Master data and capacity

Unit U4.

| Method | Path | Permission | Entitlement | Story | Router |
|---|---|---|---|---|---|
| GET | `/api/t/:orgId/sites` | member | | MD-01 | `core/sites/routes.tenant.ts`; a site-limited operator sees only its sites; `{ items, usage: { sites, docks } }` counts active sites and active and maintenance docks against `core.max_sites` and `core.max_docks` |
| POST | `/api/t/:orgId/sites` | `core.manage_sites` | limit `core.max_sites` | MD-01, MD-05 | same; seeds the three load types, imports holidays |
| GET | `/api/t/:orgId/sites/:siteId` | member | | MD-01 | same |
| PATCH | `/api/t/:orgId/sites/:siteId` | `core.manage_sites` | limit `core.max_sites` when activating | MD-01 | same; unknown zone answers 422 |
| GET | `/api/t/:orgId/sites/:siteId/halls` | member | | MD-02 | same |
| POST | `/api/t/:orgId/sites/:siteId/halls` | `core.manage_sites` | | MD-02 | same |
| PATCH | `/api/t/:orgId/sites/:siteId/halls/:hallId` | `core.manage_sites` | | MD-02 | same |
| GET | `/api/t/:orgId/sites/:siteId/docks` | member | | MD-02 | same |
| POST | `/api/t/:orgId/sites/:siteId/docks` | `core.manage_sites` | limit `core.max_docks` | MD-02 | same; 409 `conflict` with reason `duplicate_code`; a hall of another site answers 422 |
| PATCH | `/api/t/:orgId/sites/:siteId/docks/:dockId` | `core.manage_sites` | limit `core.max_docks` when leaving `inactive` | MD-02 | same |
| GET | `/api/t/:orgId/capacity/resources` | `booking.view` | | MD-03 | `booking/capacity/routes.tenant.ts`; optional `?siteId=` |
| POST | `/api/t/:orgId/capacity/resources` | `booking.manage_resources` | `booking.pools` for pools | MD-03 | same; `{ siteId, kind, name, directions, capacityCap?, dailyCap?, dockIds }` |
| PATCH | `/api/t/:orgId/capacity/resources/:resourceId` | `booking.manage_resources` | `booking.pools` for pools | MD-03 | same; never cancels bookings |
| PUT | `/api/t/:orgId/capacity/resources/:resourceId/docks` | `booking.manage_resources` | `booking.pools` for pools | MD-03 | same; `{ dockIds }`; 409 `dock_in_resource` with `dockIds` |
| PUT | `/api/t/:orgId/capacity/docks/:dockId/booking` | `booking.manage_resources` | `booking.pools` when a pool is left or joined | MD-03 | same; `{ as: 'none' } \| { as: 'single', directions? } \| { as: 'pool', resourceId }` moves the dock in one transaction and answers `{ resource }` (null for `none`); a single resource whose dock leaves is deactivated and reused, with its directions unless new ones are given, when the dock is booked as single again; a new single serves both directions; idempotent |
| GET | `/api/t/:orgId/capacity/hours` | `booking.view` | | MD-04 | same; `?siteId=` |
| PUT | `/api/t/:orgId/capacity/hours` | `booking.manage_resources` | | MD-04 | same; `{ siteId, resourceId: uuid \| null, rows: [{ weekday, opens, closes }] }` |
| GET | `/api/t/:orgId/capacity/closures` | `booking.view` | | MD-04 | same; `?siteId=&from=&to=` |
| POST | `/api/t/:orgId/capacity/closures` | `booking.manage_resources` | | MD-04 | same |
| DELETE | `/api/t/:orgId/capacity/closures/:closureId` | `booking.manage_resources` | | MD-04 | same; manual closures only, a holiday answers 409 `holiday_closure`; an unknown id answers 404 |
| POST | `/api/t/:orgId/capacity/closures/:closureId/reopen` | `booking.manage_resources` | | MD-04 | same; holiday closures, a manual one answers 409 `manual_closure`; idempotent |
| GET | `/api/t/:orgId/capacity/load-types` | `booking.view` | | MD-05 | same; `?siteId=` |
| POST | `/api/t/:orgId/capacity/load-types` | `booking.manage_resources` | `booking.duration_rules` for tiers | MD-05 | same |
| PATCH | `/api/t/:orgId/capacity/load-types/:loadTypeId` | `booking.manage_resources` | `booking.duration_rules` for tiers | MD-05 | same |
| PUT | `/api/t/:orgId/capacity/load-types/:loadTypeId/resources` | `booking.manage_resources` | | MD-05 | same |
| GET | `/api/t/:orgId/capacity/availability` | `booking.view` | | MD-04, BK-02 | same; `?siteId&date&loadTypeId&loadUnits&resourceId?`; offered starts per resource and their union (`Offers` in `api.capacity.ts`), staff view without lead time and horizon |

Request schemas and response shapes live in `packages/shared/src/modules/core/api.sites.ts` and `packages/shared/src/modules/booking/api.capacity.ts`. Capacity writers in other units call `lockSiteCapacity`, `loadDayTimeline`, `checkFit`, `offersFor` and `isOverCapacity` from `apps/api/src/modules/booking/capacity/` ([ADR-0004](../decisions/ADR-0004-booking-capacity-concurrency.md)); `offersFor` with `audience: 'carrier'` applies `booking.min_lead_minutes` and `booking.horizon_days`.

## Safety authoring and register

Unit U5. `safety/authoring/routes.tenant.ts` and `safety/register/routes.tenant.ts`, mounted at `/safety` with `withModule('safety')`. Schemas in `packages/shared/src/modules/safety/api.authoring.ts` and `api.register.ts`.

| Method | Path | Permission | Entitlement | Story | Notes |
|---|---|---|---|---|---|
| GET | `/api/t/:orgId/safety/instructions` | `safety.manage_briefings` | | SF-01 | `{ items }` with sites, archive time, published and draft version |
| POST | `/api/t/:orgId/safety/instructions` | `safety.manage_briefings` | limit `safety.max_briefing_templates` | SF-01 | `{ name, allSites, siteIds }`; version 1 draft from the 12-language platform template, de and en flagged `source`, the others `machine`; template questions only with `safety.quiz`; a site of another tenant answers 404 |
| PATCH | `/api/t/:orgId/safety/instructions/:instructionId` | `safety.manage_briefings` | | SF-01 | `{ name?, allSites?, siteIds?, archived? }`; `allSites` and `siteIds` change together; `archived: false` counts against the limit again |
| GET | `/api/t/:orgId/safety/instructions/:instructionId/versions` | `safety.manage_briefings` | | SF-01 | `{ items }`, newest first, with locales, translation flags and question counts |
| POST | `/api/t/:orgId/safety/instructions/:instructionId/versions` | `safety.manage_briefings` | | SF-01 | new draft copied from the latest version (201); the open draft if one exists (200); without `safety.quiz` the copy drops its questions |
| GET | `/api/t/:orgId/safety/versions/:versionId` | `safety.manage_briefings` | | SF-01 | all locales with questions, answers and content hash |
| PUT | `/api/t/:orgId/safety/versions/:versionId/content/:locale` | `safety.manage_briefings` | `safety.quiz` when questions are sent | SF-01, SF-02 | `{ title, blocks, questions, statement, translation }`; draft only, else 409 `invalid_transition` with `status`; at most 5 questions, 2 to 4 options each |
| POST | `/api/t/:orgId/safety/versions/:versionId/publish` | `safety.manage_briefings` | | SF-01, SF-02 | `{ materialChange }`; retires the previous version; with `safety.quiz`, 409 `conflict` reason `quiz_incomplete` with `locales`, `min`, `max` unless every locale has 3 to 5 questions; without it, 403 `entitlement_required` while any locale has questions; repeating it answers 200 |
| GET | `/api/t/:orgId/safety/acknowledgements/filters` | `safety.view_register` | | SF-03 | `{ instructions, carriers }`: every instruction (archived too) with its non-draft versions, newest first, and the carriers of the bookings that have acknowledgements; the choices of the register filters, because `safety.view_register` alone cannot list instructions |
| POST | `/api/t/:orgId/safety/acknowledgements/search` | `safety.view_register` | | SF-03 | `{ siteId?, carrierId?, driverName?, instructionId?, versionId?, status?, limit?, cursor? }`; newest first, paginated; `status` is `valid`, `visit_only`, `expired` or `outdated` from `acknowledgementStatus`; restricted rows (TN-06) are left out |
| POST | `/api/t/:orgId/safety/acknowledgements.csv` | `safety.view_register` | | SF-03 | same filters without paging, up to 50,000 rows; CSV format of [Time and formats](#time-and-formats) |

The register routes take their filters in a POST body, not a query string, because the driver name is a personal search term ([Requests](#requests)).

## Bookings (staff)

Unit U6a, built. `booking/staff/routes.tenant.ts`, mounted at `/bookings`. Creates, reschedules and duration-changing avis edits take the site capacity lock ([ADR-0004](../decisions/ADR-0004-booking-capacity-concurrency.md)). Request schemas and response shapes live in `packages/shared/src/modules/booking/api.staff.ts`; commands run through `transitionBooking` ([Booking lifecycle](booking-lifecycle.md)). Reads and commands answer the `BookingView` (booking, avis, safety status, driver link state).

| Method | Path | Permission | Entitlement | Story | Notes |
|---|---|---|---|---|---|
| GET | `/api/t/:orgId/bookings/board` | `booking.view` | | BK-01 | `?siteId&date`; columns per resource with `slots` (`capacity`, `booked` per grid slot) and `bookings` with `overCapacity`; polled every 15 s |
| GET | `/api/t/:orgId/bookings` | `booking.view` | | BK-01 | `?siteId&date&status&limit&cursor`; list view with the same summaries, by start |
| GET | `/api/t/:orgId/bookings/carrier-options` | `booking.staff_book` | | BK-02 | `?q=`; actively linked carriers `{ items: [{ id, name }] }` |
| GET | `/api/t/:orgId/bookings/:bookingId` | `booking.view` | | BK-01, BK-03 | booking, avis, safety status |
| GET | `/api/t/:orgId/bookings/:bookingId/events` | `booking.view` | | YD-08 | `?limit&cursor`, oldest first; `actor` only with `booking.view_actors` |
| POST | `/api/t/:orgId/bookings` | `booking.staff_book`; `booking.force` when `force` | | BK-02, AV-01 | `{ clientRequestId, siteId, resourceId?, loadTypeId, startsAt, carrier: { id } \| { name }, avis, force?, forceReason? }`; 201, or 200 with the first booking for a repeated `clientRequestId`; `forceReason` required with `force` |
| PATCH | `/api/t/:orgId/bookings/:bookingId` | `booking.staff_book`; `booking.force` when `force` | | BK-03 | reschedule `{ startsAt, resourceId?, version, force?, forceReason? }`; moves the driver link expiry to the new start plus 7 days |
| PUT | `/api/t/:orgId/bookings/:bookingId/avis` | `booking.staff_book` | `avis.basic` | AV-02 | `{ avis, version }`; from `checked_in` on, no capacity check |
| POST | `/api/t/:orgId/bookings/:bookingId/cancel` | `booking.staff_book` | | BK-03 | `{ reason? }` (send `{}` without one) |
| GET | `/api/t/:orgId/bookings/:bookingId/driver-link` | `booking.staff_book` | | CR-06 | `{ url, expiresAt }`; 404 once the link is revoked |
| POST | `/api/t/:orgId/bookings/:bookingId/driver-link` | `booking.staff_book` | | CR-06 | regenerate; answers the new `{ url, expiresAt }` |
| POST | `/api/t/:orgId/bookings/:bookingId/driver-link/email` | `booking.staff_book` | `notify.email` | CR-06 | `{ email, locale }`; 202 |

## Carrier network

Unit U7. Router files in `apps/api/src/modules/booking/{carriers,registration}/`; shapes in `packages/shared/src/modules/booking/api.carriers.ts`.

| Method | Path | Party | Permission | Entitlement | Story | Router |
|---|---|---|---|---|---|---|
| GET | `/api/t/:orgId/carriers` | tenant | `booking.manage_carriers` | | TN-03 | `booking/carriers/routes.tenant.ts`; `{ links, invitations }`: linked carriers with name, country, status and source, and invitations neither accepted nor revoked |
| POST | `/api/t/:orgId/carriers/invitations` | tenant | `booking.manage_carriers` | `booking.carrier_portal` | TN-03 | same; `{ companyName, email, locale? }` → 201; emails `booking.carrier-invitation` in `locale` (default the inviter's). A pending invitation for the same email is revoked, so inviting again resends |
| DELETE | `/api/t/:orgId/carriers/invitations/:invitationId` | tenant | `booking.manage_carriers` | | TN-03 | same; 204, also when nothing matched |
| PATCH | `/api/t/:orgId/carriers/:carrierId` | tenant | `booking.manage_carriers` | | TN-03 | same; `{ status: 'active' \| 'deactivated' }`; 404 without a link |
| GET | `/api/t/:orgId/carriers/registrations` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | same; `{ items }`, newest first, every status |
| POST | `/api/t/:orgId/carriers/registrations/:registrationId/approve` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | same; links the carrier (reactivating a deactivated link), emails `booking.registration-approved`; 409 `invalid_transition` with `status` unless `pending_approval` |
| POST | `/api/t/:orgId/carriers/registrations/:registrationId/reject` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | same; `{ reason }`, emails `booking.registration-rejected`; 409 as for approve |
| GET | `/api/t/:orgId/carriers/public-links` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | same; `{ items }`: per site the slug (or `null`), `enabled` (`booking.public_link_enabled`) and `mode` (`booking.public_registration_mode`) |
| POST | `/api/t/:orgId/carriers/public-links` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | same; `{ siteId }`; 201 when it creates the site's slug, 200 with the existing one; 404 for a site of another tenant |
| POST | `/api/t/:orgId/carriers/public-links/:siteId/regenerate` | tenant | `booking.manage_carriers` | `booking.public_link` | TN-04 | same; revokes the slug and issues a new one, for a link that leaked |
| GET | `/api/c/:orgId/tenants` | carrier | member | | CR-02, CR-05 | `booking/carriers/routes.carrier.ts`; `{ items }`: every tenant the carrier is linked to or registered at, with `link` (status, since) and the newest `registration` (status, reject reason) |
| GET | `/api/public/links/:slug` | public | none | `booking.public_link` and the site's `booking.public_link_enabled` | CR-02, TN-04 | `booking/registration/routes.public.ts`; `{ tenantName, siteName, city, country }`. 404 for an unknown or revoked slug, the feature or the site setting off, or an inactive site. The setting is the only on and off switch; the slug only names the link |
| POST | `/api/public/links/:slug/registrations` | public | none | same | CR-02 | same; `{ companyName, country, contactName, email, locale? }`; always 202 with an empty body. A known email gets a sign-in prompt by email instead of the verification text, both with the single-use `/carrier-registration#<token>` link, so the response never reveals an account. Limits `registration_request` (5 per hour per email) and `registration_ip` (100 per hour per client address); over either the answer is the same 202 and nothing is written |
| POST | `/api/public/registrations/verify` | token | token | | CR-02 | same; `{ token }` → `{ carrierId, status }`; verifies the email, signs in, applies `booking.public_registration_mode`. A new email gets a verified account without password and a new carrier org; a known email answers 401 `sign_in_required` with `email` until that user is signed in, then attaches to their carrier org. `auto_approve` links at once but leaves a link the tenant deactivated off. Single use, 24 hours. Service: `verifyRegistration` in `verify.redeem.ts` |
| POST | `/api/public/carrier-invitations/inspect` | token | token | | TN-03, CR-01 | `booking/carriers/routes.public.ts`; `{ token }` → `{ tenantName, companyName, email, hasAccount }` |
| POST | `/api/public/carrier-invitations/accept` | token, then user | token | | TN-03, CR-01 | same; `{ token, name?, password?, companyName?, locale? }` → `{ carrierId }`. A new user needs `name` and `password` (422 without) and becomes carrier admin of a new org; a user signed in with the invited email links their existing carrier org; an email with an account answers 401 `sign_in_required` with `email`. The link is active, also when the tenant deactivated it before sending this invitation; a deactivation after it stays. Single use, 7 days. Service: `acceptCarrierInvitation` in `accept.redeem.ts` |

`assertActiveLink(tx, tenantId, carrierId)` in `booking/carriers/links.ts` throws 403 `forbidden` with `reason: 'link_inactive'` unless the link is active. Booking creation and reschedules call it (U8); reads and cancel do not, so a deactivated carrier keeps seeing its bookings.

## Carrier booking portal

Unit U8. Carrier reads in `booking/portal/routes.carrier.ts` at `/api/c/:orgId/bookings`; writes in `booking/portal/routes.carrier-at-tenant.ts` at `/api/c/:orgId/at/:tenantId`. Every `at` route needs an active link (else 403 `forbidden`, reason `link_inactive`), except `cancel`, which a deactivated link still allows.

| Method | Path | Permission | Entitlement (tenant's) | Story | Notes |
|---|---|---|---|---|---|
| GET | `/api/c/:orgId/bookings` | `booking.view` | | CR-05 | all linked tenants; `?tenantId&siteId&from&to&status&cursor` |
| GET | `/api/c/:orgId/bookings/:bookingId` | `booking.view` | | CR-05 | timeline gate-in to gate-out, events without actors |
| GET | `/api/c/:orgId/bookings/:bookingId/driver-link` | `booking.book` | | CR-06 | `{ url }` |
| GET | `/api/c/:orgId/bookings/:bookingId/rebook` | `booking.book` | | BK-06 | prefill: site, load type, avis without references, date and driver |
| GET | `/api/c/:orgId/at/:tenantId/sites` | `booking.book` | `booking.carrier_portal` | BK-04 | address, phone, zone |
| GET | `/api/c/:orgId/at/:tenantId/load-types` | `booking.book` | `booking.carrier_portal` | BK-04 | `?siteId=`; carrier-bookable only |
| GET | `/api/c/:orgId/at/:tenantId/availability` | `booking.book` | `booking.carrier_portal` | BK-04 | `?siteId&loadTypeId&date&loadUnits`; offered starts |
| POST | `/api/c/:orgId/at/:tenantId/bookings` | `booking.book` | `booking.carrier_portal` | BK-04, AV-01 | `{ clientRequestId, siteId, loadTypeId, startsAt, avis }`; 409 with `offers` when the last unit went elsewhere |
| PATCH | `/api/c/:orgId/at/:tenantId/bookings/:bookingId` | `booking.book` | `booking.carrier_portal` | BK-05 | `{ startsAt, version }`; before the cutoff |
| POST | `/api/c/:orgId/at/:tenantId/bookings/:bookingId/cancel` | `booking.book` | `booking.carrier_portal` | BK-05 | before the cutoff |
| PUT | `/api/c/:orgId/at/:tenantId/bookings/:bookingId/avis` | `booking.book` | `avis.basic` | AV-02 | before the cutoff |
| POST | `/api/c/:orgId/at/:tenantId/bookings/:bookingId/driver-link` | `booking.book` | | CR-06 | regenerate |
| POST | `/api/c/:orgId/at/:tenantId/bookings/:bookingId/driver-link/email` | `booking.book` | `notify.email` | CR-06 | `{ email, locale }` |

## Yard

Unit U9, built. `yard/routes.tenant.ts`, mounted at `/yard` with `withModule('yard')` (`yard.checkin_qr`). Request schemas and response shapes live in `packages/shared/src/modules/yard/api.ts`; commands run through `transitionBooking` ([Booking lifecycle](booking-lifecycle.md)). Lists and commands answer `YardTruck`: carrier, plate (seen at the gate, else announced), driver phone, load type, load units, resource, slot, safety status, punctuality, dock with code and hall, the visit timestamps, `since` (when the current status began) and `version`. Every route is site-scoped: an operator of another site gets 404.

| Method | Path | Permission | Entitlement | Story | Notes |
|---|---|---|---|---|---|
| GET | `/api/t/:orgId/yard/expected` | `yard.gate` | | YD-01 | `?siteId&date?` (`date` defaults to today at the site); `{ siteId, date, timeZone, items }` by start: the day's bookings except cancelled and requested ones, plus no-shows whose `no_show_at` falls on that day. Before check-in, `punctuality` is what a check-in now would record |
| POST | `/api/t/:orgId/yard/search` | `yard.gate` | | YD-01 | `{ siteId, q }` (2 to 120 characters); exact booking code (case and surrounding whitespace ignored, so scanner input works), plate announced or seen (normalized), exact reference, or part of the carrier name; active visits and today's no-shows, nearest start first, at most 20 |
| GET | `/api/t/:orgId/yard/on-site` | `yard.gate` | | YD-04 | `?siteId`; trucks in `checked_in` to `done`, whatever day they were booked for, by gate-in; each with `onSiteMinutes`, `waitMinutes` (from `max(checked_in_at, starts_at)` to the first dock timestamp, or to now) and `standgeld` (`onSiteMinutes` above `yard.standgeld_flag_minutes`) |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/check-in` | `yard.gate` | | YD-02 | `{ plateSeen? }`; 409 `safety_missing` under enforcement; the truck shows `safety.status = 'missing'` as a warning otherwise |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/turn-away` | `yard.gate` | | YD-02 | `{ reason }` from the turn-away list; from `confirmed`, `no_show` or `checked_in` |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/depart` | `yard.gate` | | YD-05 | `{ reason? }`; 422 without a reason before `done` |
| POST | `/api/t/:orgId/yard/walk-ins` | `yard.gate` and `booking.walk_in` | | YD-03 | `{ clientRequestId, siteId, resourceId?, loadTypeId, carrier: { id } \| { name }, plateSeen, outcome: 'check_in', avis }` or `{ ..., outcome: 'turn_away', avis?, reason }`. Starts at the grid slot containing now; never 409 for hours or capacity. 201 with `{ truck, safety }`: the truck in `checked_in` or `turned_away`, or in `confirmed` with `safety: 'missing'` when enforcement blocks the check-in; 200 with the first booking for a repeated `clientRequestId`. 422 on `loadTypeId` when no active resource takes the load type |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/acknowledgement-candidates` | `yard.gate` | module `safety` | YD-02 | `{ name }` (part of the driver name, at least 2 characters); `{ items }` of the tenant's acknowledgements of instructions that apply to the site and would be valid for this visit, newest first, at most 20; 409 `invalid_transition` once the visit cannot take a briefing |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/acknowledgements` | `yard.gate` | module `safety` | YD-02 | `{ acknowledgementId }`; `link_acknowledgement` with `via: 'gate_lookup'`; 409 `acknowledgement_invalid` |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/briefing-session` | `yard.gate` | module `safety` | YD-02 | no body; issues a 30-minute `staff` driver access and returns `{ url, expiresAt }` |
| GET | `/api/t/:orgId/yard/docks` | `yard.call` | `yard.call_to_dock` | YD-06 | `?siteId`; `{ halls: [{ id, name, docks: [{ id, code, status, temperatureZone, adrAllowed, resourceId, occupant }] }], queue }`; inactive docks left out, maintenance docks kept; the queue holds `checked_in` trucks by slot start, with waits |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/call` | `yard.call` | `yard.call_to_dock` | YD-07 | `{ dockId }`; `{ truck, outsideResource }`; 409 `dock_occupied`, 409 `dock_inactive`; from `called` a reassignment |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/uncall` | `yard.call` | `yard.call_to_dock` | YD-07 | back to `checked_in`; frees the dock |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/dock` | `yard.dock` | `yard.call_to_dock` | YD-08 | `{ dockId? }`; 422 without a dock when none is assigned |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/loading` | `yard.dock` | `yard.call_to_dock` | YD-08 | `{ dockId? }`, as `dock` |
| POST | `/api/t/:orgId/yard/bookings/:bookingId/complete` | `yard.dock` | `yard.call_to_dock` | YD-08 | `{ actualLoadUnits, discrepancyNote? }` |

The driver view reads the called dock from `booking.dock_id`, which `call` sets and `uncall` clears; its code and hall name come from `dock` and `hall` (DR-03). The event log of a visit is `GET /api/t/:orgId/bookings/:bookingId/events` (YD-08).

## Driver

Unit U10, built. Response shapes and request schemas live in `packages/shared/src/modules/driver/api.ts` (`ExchangeBody`, `DriverBookingView`) and `packages/shared/src/modules/safety/api.driver.ts` (briefing list, content, attempt and acknowledgement). No answer of these routes carries the driver's name, phone or plate, and none carries a token ([ADR-0008](../decisions/ADR-0008-driver-token-pwa-delivery.md)).

| Method | Path | Party | Entitlement | Story | Router |
|---|---|---|---|---|---|
| POST | `/api/public/driver-session` | token | | DR-01 | `driver/session/routes.public.ts`; `{ token }`; 204 and `rf_driver=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/driver; Max-Age=<seconds to the link's expiry>`; unknown, expired and revoked tokens answer the same 401 `unauthorized`; every call counts against `driver_exchange` (10 per minute per IP, 429 `rate_limited`); sets `driver_access.last_used_at` |
| DELETE | `/api/driver/session` | driver | | DR-01 | `driver/session/routes.driver.ts`; 204, clears the cookie |
| GET | `/api/driver/booking` | driver | | DR-01, DR-03, SF-04 | `driver/view/routes.driver.ts`; `DriverBookingView`: `asOf`, `channel`, tenant name and logo URL, site name, address lines, map link, zone and phone, code, status, slot and check-in and call instants, `dock` (`{ code, hall }` while called, at the dock or loading), safety `{ status, validUntil }`, `privacyNoticeUrl`, `linkExpiresAt`; polled every 15 s; writes nothing |
| GET | `/api/driver/briefings` | driver | module `safety` | SF-04 | `safety/driver/routes.driver.ts` at `/briefings`; on a `link` session with an `rf_device` cookie it first links this phone's valid passes at the tenant to the booking (`link_acknowledgement` via `pass`) for instructions still missing; then `{ items: [{ instructionId, name, status, expiresAt, quiz, locales }] }` |
| GET | `/api/driver/briefings/:instructionId` | driver | module `safety` | SF-04, DR-02 | `?locale=`; the published version in that locale, else en, else its first locale; `{ instructionId, version, locale, translation, title, blocks, questions, statement }`; questions without answers, and none while `safety.quiz` is off; 404 for an instruction that does not apply to the booking's site |
| POST | `/api/driver/briefings/:instructionId/attempts` | driver | `safety.quiz` | SF-04, SF-02 | `{ locale, answers: { <questionId>: <option index> } }` → `{ score, passed, attempts, wrong }`; passes at `safety.quiz_pass_percent`; counts every attempt in `safety_attempt` per booking and version; the latest attempt decides |
| POST | `/api/driver/briefings/:instructionId/acknowledgement` | driver | module `safety` | SF-04 | `{ locale, name, confirmed: true }` → 201 `{ expiresAt }`; with a quiz and `safety.quiz` on, 409 `conflict` reason `quiz_not_passed` until the latest attempt passed; stores the acknowledgement through `recordAcknowledgement` with the session's channel, links it (`link_acknowledgement` via `completed`); on a `link` session with an expiry it sets `rf_device` (one year, `Path=/api/driver`) when absent and upserts the `safety_pass`; a `staff` session (gate device, YD-02) never does |

The exchange has an account case with credential `none`: the harness's `token` credential refuses a driver token as a wrong party, which is this route's only valid token. `driver/session/session.test.ts` covers unknown, expired and revoked tokens and the limit.

## Reports

Unit U11. `report/kpi/routes.tenant.ts`, mounted at `/reports` with `withModule('report')`.

| Method | Path | Permission | Entitlement | Story | Notes |
|---|---|---|---|---|---|
| GET | `/api/t/:orgId/reports/kpis` | `report.view` | | RP-01 | `?siteId&from&to&resourceId?&carrierId?`; dates are site-local |
| GET | `/api/t/:orgId/reports/kpis.csv` | `report.view` | `report.export` | RP-02 | |
| GET | `/api/t/:orgId/reports/visits` | `report.view` | | RP-02 | paginated visit list with all timestamps |
| GET | `/api/t/:orgId/reports/visits.csv` | `report.view` | `report.export` | RP-02 | |

As built (U11):

- Request and response shapes live in `packages/shared/src/modules/report/api.ts` (`ReportFilter`, `VisitQuery`, `KPIS`, `KpiReport`, `VisitItem`). A period runs from `from` to `to`, both site-local days included, at most 366 days; a reversed or longer period answers 422 with path `["to"]`.
- `GET /kpis` answers `{ site, from, to, standgeldMinutes, kpis }`. `kpis` has one entry per row of `KPIS` (`bookingsDue`, `noShowRate`, `lateCancellationRate`, `onTimeRate`, `earlyRate`, `lateRate`, `waitMinutes`, `dockDwellMinutes`, `turnaroundMinutes`, `dockUtilisation`, `portalAdoption`, `standgeldVisits`): rates in percent and means in minutes, rounded to one decimal half away from zero, `null` for an empty denominator.
- A `siteId` the caller cannot see, or a `resourceId` of another site, answers 404.
- `GET /visits` answers `{ site, items, nextCursor }`, ordered by `starts_at`, with every lifecycle timestamp and the visit's wait, dock dwell and turnaround in minutes. `limit` and `cursor` travel in the query string.
- The CSV routes take the filter of `GET /kpis`. The language is the user's `locale`, else the tenant's `i18n.default_locale`. Decimals use `,` for de and pl and `.` for en. The KPI CSV has one row per KPI with the columns site, from, to, KPI, value and unit. The visit CSV holds at most 50,000 rows and no personal data.

## Privacy

Unit U11. `privacy/requests/routes.tenant.ts`, mounted at `/privacy`.

| Method | Path | Permission | Story | Notes |
|---|---|---|---|---|
| POST | `/api/t/:orgId/privacy/search` | `privacy.manage_requests` | TN-06 | `{ name?, phone?, plate? }`; matching bookings and acknowledgements |
| POST | `/api/t/:orgId/privacy/export` | `privacy.manage_requests` | TN-06 | same body; JSON download |
| POST | `/api/t/:orgId/privacy/erase` | `privacy.manage_requests` | TN-06 | same body plus `{ confirm: true }`; pseudonymizes bookings, restricts acknowledgements under retention |

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
