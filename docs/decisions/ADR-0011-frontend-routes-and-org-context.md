---
title: ADR-0011 Frontend route structure per area with the active org in the URL
description: How the back-office SPA splits into platform, tenant, carrier and public areas, the authoritative route map with nav item or entry point per screen, the station layout for gate and dock, tokens in the URL fragment, and how routes, navigation and actions are gated from one context request.
type: explanation
audience: [agent, developer]
tags: [adr, frontend, routing, tenancy, entitlements, ux]
status: stable
updated: 2026-10-20
related: [docs/decisions/ADR-0015-data-tables-and-entity-views.md, docs/explanation/mvp-scope.md, docs/explanation/research/tech-architecture.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md, docs/decisions/ADR-0008-driver-token-pwa-delivery.md]
---

# ADR-0011: Frontend route structure per area with the active org in the URL

Status: accepted, 2026-10-19. Revised 2026-10-19 after the design review: this ADR now holds the one route map, and the UX concept points here. Amended by [ADR-0015](ADR-0015-data-tables-and-entity-views.md) on 2026-10-20: entity views, detail tabs as child routes, and list state in the URL. The UX concept decides layouts and screens; this ADR fixes the routing contract that screens plug into.

## Context

One user can hold several memberships: a dispatcher at two tenants, or a carrier user who is also a carrier admin elsewhere (scope: "A user has one role per membership and can belong to several orgs"). The API must check the active org against memberships on every request. Navigation and routes must hide what the tenant's entitlements or the user's permissions do not allow, while the API enforces the same keys. The TanStack Router plugin generates the route tree from files, and several units add screens in parallel.

## Options considered

| Option | Verdict |
|---|---|
| Active org in a header or cookie, routes without it | A bookmark or a shared link opens the wrong tenant. Two tabs on two tenants overwrite each other. |
| Subdomain per tenant | Needs wildcard TLS and DNS, breaks same-origin cookies, and carriers span tenants. |
| **Org id as a path segment** (`/t/$orgId/...`, `/c/$orgId/...`, and `/api/t/:orgId/...`) | Links are self-contained, tabs are independent, the `hc` client types include the parameter, and query keys include the org. |

## Decision

### Areas

| Area | SPA path | API prefix | Party | Who |
|---|---|---|---|---|
| Sign-in and token pages | `/login`, `/auth/magic`, `/auth/reset`, `/invite`, `/carrier-invite`, `/carrier-registration` | `/api/auth`, `/api/public` | none, `token` | anyone with a link |
| Org picker | `/` | `/api/me` | `user` | signed-in users |
| Platform | `/platform/...` | `/api/platform/...` | `platform` | `platform_admin` |
| Tenant | `/t/$orgId/...` | `/api/t/:orgId/...` | `tenant` | tenant staff |
| Carrier | `/c/$orgId/...` | `/api/c/:orgId/...` | `carrier`, `carrier_at_tenant` | carrier users |
| Public booking link | `/r/$slug` | `/api/public/links/:slug` | `public` | prospective carriers |
| Driver | `/d` (separate app) | `/api/driver/...` | `driver` | drivers |

- `/` lists the user's memberships from `/api/me` and redirects when there is exactly one. The last used org is remembered in `localStorage`.
- Each area has a layout route (`platform/route.tsx`, `t/$orgId/route.tsx`, `c/$orgId/route.tsx`) owning the shell, the org switcher and the error boundary.

### Route map

This table is the only route map. Every screen has a nav item (rendered by `navFor` from the manifests) or names the screen it is reached from. A screen that fits neither does not ship. "nav `booking.plan`" names the manifest item `plan` of module `booking`.

From [ADR-0015](ADR-0015-data-tables-and-entity-views.md):

- Every entity with its own id that users manage on its own has a view at `<list path>/$<entity>Id`, and list rows link to it. Rows edited only inside their parent's view (hours, closures, overrides, setting values, invitations, duration rules) need none.
- A detail view's tabs are child routes `<detail path>/<tab>`; the first tab is the index route. Tabs that switch between lists on one page stay search params.
- An unknown or foreign id shows the area's "no access" page inside the shell.
- A data-table list keeps its search, facets, sort and page in the search params listed in its row.

**Sign-in and token pages** (no shell). Tokens travel only in the URL fragment, never in the path or the query, so they stay out of request lines, logs, history and `Referer` ([ADR-0003](ADR-0003-authentication-self-built-sessions.md)). The page reads `location.hash`, removes it with `history.replaceState`, then posts the token.

| Path | Screen | Stories | Reached from | Unit |
|---|---|---|---|---|
| `/login` | Sign in by password; request a magic link or a reset | CR-03 | sign-out, any 401 | U2 |
| `/auth/magic#<token>` | Magic link sign-in | CR-03 | email | U2 |
| `/auth/reset#<token>` | Set a new password | CR-03 | email | U2 |
| `/invite#<token>` | Accept a staff, tenant admin or carrier user invitation | PL-01, TN-01, CR-04 | email | U2 |
| `/carrier-invite#<token>` | Accept a carrier invitation | TN-03, CR-01 | email | U7 |
| `/r/$slug` | Register through a public booking link | CR-02, TN-04 | link shared by the tenant | U7 |
| `/carrier-registration#<token>` | Verify the registration email and sign in | CR-02 | email | U7 |
| `/` | Org picker | | after sign-in; org menu | U2 |

**Platform** (office shell with sidebar).

| Path | Screen | Stories | Nav item or reached from | Unit |
|---|---|---|---|---|
| `/platform/tenants?q=&package=&sort=&order=&page=&pageSize=` | Tenants with usage meters against limits: search by name, package filter, sort by name or creation, paging | PL-01, PL-04 | nav `core.tenants` | U3 |
| `/platform/tenants/$tenantId` | Package and overrides | PL-02 | row of the tenant list | U3 |
| `/platform/packages` | Packages, read-only | PL-02 | nav `core.packages` | U3 |
| `/platform/settings` | Platform defaults | PL-03 | nav `core.platform_settings` | U3 |

**Tenant office** (office shell with sidebar).

| Path | Screen | Stories | Nav item or reached from | Unit |
|---|---|---|---|---|
| `/t/$orgId/plan?site=&date=&view=board\|list&booking=<id>&new=1` | Plan board with detail panel (`booking`) and the staff booking sheet (`new`) | BK-01, BK-02, BK-03, MD-03 | nav `booking.plan` | U6b |
| `/t/$orgId/bookings/$bookingId` | Booking detail: avis edit, driver link, event log | BK-03, AV-02, CR-06, YD-08 | "Open" in the plan board's detail panel; gate and dock rows | U6b |
| `/t/$orgId/reports?site=&from=&to=` | KPIs and CSV export | RP-01, RP-02 | nav `report.reports` | U11 |
| `/t/$orgId/sites` | Sites with usage against limits | MD-01 | nav `core.sites` | U4 |
| `/t/$orgId/sites/$siteId` | Halls, docks and the pool editor in three panes | MD-01, MD-02, MD-03 | row of the site list | U4 |
| `/t/$orgId/sites/$siteId/hours` | Weekly hours, closures and holidays | MD-04 | tab on the site page | U4 |
| `/t/$orgId/sites/$siteId/load-types` | Load types and duration rules | MD-05 | tab on the site page | U4 |
| `/t/$orgId/carriers?tab=linked\|registrations\|links` | Linked carriers, invitations, registrations, public links | TN-03, TN-04 | nav `booking.carriers` | U7 |
| `/t/$orgId/safety/briefings` | Briefings | SF-01 | nav `safety.briefings` | U5 |
| `/t/$orgId/safety/briefings/$instructionId` | Briefing editor: versions, locales, quiz | SF-01, SF-02 | row of the briefing list | U5 |
| `/t/$orgId/safety/acknowledgements` | Acknowledgement register | SF-03 | nav `safety.acknowledgements` | U5 |
| `/t/$orgId/staff` | Staff and invitations | TN-01 | nav `core.staff` | U3 |
| `/t/$orgId/settings?site=` | Settings with inheritance | TN-02 | nav `core.settings` | U3 |
| `/t/$orgId/brand` | Logo | TN-05 | nav `brand.brand` | U3 |
| `/t/$orgId/privacy` | Data subject requests | TN-06 | nav `privacy.privacy` | U11 |

**Tenant stations** (station layout, no sidebar).

| Path | Screen | Stories | Nav item | Unit |
|---|---|---|---|---|
| `/t/$orgId/gate?site=&tab=expected\|onsite\|departed&checkin=<id>&walkin=1` | Gate: expected trucks, check-in, walk-in, turn away, on-site list, check-out | YD-01 to YD-05 | nav `yard.gate` | U9 |
| `/t/$orgId/docks?site=&call=<id>` | Dock overview, queue, call and uncall, progress | YD-06 to YD-08 | nav `yard.docks` | U9 |

**Carrier** (office shell with sidebar).

| Path | Screen | Stories | Nav item or reached from | Unit |
|---|---|---|---|---|
| `/c/$orgId/bookings?tenant=&site=&from=&to=&status=` | Bookings across tenants | CR-05 | nav `booking.bookings` | U8 |
| `/c/$orgId/bookings/$bookingId` | Booking detail: change, cancel, avis, driver link | BK-05, AV-02, CR-06 | row of the booking list | U8 |
| `/c/$orgId/book?tenant=&step=where\|slot\|avis\|confirmed&again=<id>` | Booking wizard | BK-04, BK-06, AV-01 | nav `booking.book`; "Book again" on the detail | U8 |
| `/c/$orgId/tenants` | Warehouses: linked tenants with link and registration status | CR-02, CR-05 | nav `booking.tenants` | U7 |
| `/c/$orgId/users` | Colleagues and invitations | CR-04 | nav `core.users` | U3 |

**Driver.** `/d#<token>` is the driver PWA ([ADR-0008](ADR-0008-driver-token-pwa-delivery.md)). After the exchange the URL is `/d`. The booking, briefing, quiz, waiting, called and done screens are states of one component, not routes. U10.

`validateCatalog` rejects a nav path outside its area prefix, so the manifests cannot drift from this table's areas.

### Station layout

- Gate and dock screens run on tablets. They use the station layout, rendered by `TabletShell` (`apps/web/src/components/shells/tablet-shell.tsx` from the UX prototype, made real by U2): no sidebar, a header with the site menu, the site clock, a live or offline pill, and a user menu that lists the user's other `navFor` items.
- The tenant layout `t/$orgId/route.tsx` (U2) renders `TabletShell` when the deepest match sets `staticData: { shell: 'station' }`, and the office shell otherwise. U9's route files set it. No pathless layout and no file in U2's directory changes when a station screen is added.
- **Site.** The station's site is the `?site=` search param, so a tablet refresh or a bookmark returns to the same site. Without it, the screen takes the site this device used last for this org (`localStorage`), else the user's first allowed site, and writes it back to the URL with `replace`.
- **Offline.** The station shows the last loaded lists with "as of HH:mm" and disables every action with the reason "Offline". It queues nothing: a replayed check-in would carry the wrong time and punctuality, and a replayed call could hit a dock that was taken meanwhile.

### Context and gating

- The tenant layout's `beforeLoad` fetches `GET /api/t/:orgId/context` through `queryClient.ensureQueryData`:
  `{ org, role, permissions, entitlements, sites, settings }`. `settings` holds the resolved, available settings per site the user may see. The carrier and platform layouts fetch their own context (`permissions`, `org`, and for carriers the linked tenants with their `booking.carrier_portal` state).
- A 404 from the context request (not a member, or no such org) renders the "no access" page, never a redirect that reveals whether the org exists.
- `apps/web/src/lib/access.ts` exports `guard({ permission?, entitlement? })` for a route's `beforeLoad`, and `useAccess()` with `can(permission)` and `has(feature)` for actions. Route files call `guard` with the same keys their API routes require.
- The sidebar is `navFor(catalog, { area, permissions, entitlements })` from `@rampflow/shared`. Labels come from `<module>:nav.<id>`; icons are lucide names rendered through `lucide-react`'s dynamic icon.
- The UI only hides. Every API route enforces the same permission and entitlement ([Module contract](../reference/module-contract.md)).
- Query keys start with `[area, orgId, ...]`, so switching org never shows cached data of another org.

### File ownership

- Screens live in `apps/web/src/routes/<area>/...` and their components in `apps/web/src/modules/<module>/`. Each unit owns whole route directories (for example U9 owns `t/$orgId/gate/` and `t/$orgId/docks/`).
- `apps/web/src/routeTree.gen.ts` is generated. On a merge conflict, take either side and run `pnpm --filter @rampflow/web routes:gen`; never edit it by hand.
- Every screen follows the UX concept and uses original shadcn components with the Field pattern for forms.

## Consequences

- Deep links work across tabs and orgs, and the org id in every API path makes the leak tests' "foreign org id" case trivial to express.
- The context request is one round trip per org switch and is cached by TanStack Query; actions read from it without further requests.
- Route-level checks duplicate API checks by design. If they ever disagree, the API wins and the user sees a 403 toast instead of a hidden button.
