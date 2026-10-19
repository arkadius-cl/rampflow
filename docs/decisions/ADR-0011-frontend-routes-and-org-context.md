---
title: ADR-0011 Frontend route structure per area with the active org in the URL
description: How the back-office SPA splits into platform, tenant, carrier and public areas, why the active org is a path segment in both the SPA and the API, and how routes, navigation and actions are gated from one context request.
type: explanation
audience: [agent, developer]
tags: [adr, frontend, routing, tenancy, entitlements, ux]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/tech-architecture.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md, docs/decisions/ADR-0008-driver-token-pwa-delivery.md]
---

# ADR-0011: Frontend route structure per area with the active org in the URL

Status: accepted, 2026-10-19. The UX concept decides layouts and screens; this ADR fixes the routing contract that screens plug into.

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
| Sign-in and token pages | `/login`, `/auth/magic`, `/auth/reset`, `/invite`, `/carrier-invite` | `/api/auth`, `/api/invitations`, `/api/public` | none, `token` | anyone with a link |
| Org picker | `/` | `/api/me` | `user` | signed-in users |
| Platform | `/platform/...` | `/api/platform/...` | `platform` | `platform_admin` |
| Tenant | `/t/$orgId/...` | `/api/t/:orgId/...` | `tenant` | tenant staff |
| Carrier | `/c/$orgId/...` | `/api/c/:orgId/...` | `carrier`, `carrier_at_tenant` | carrier users |
| Public booking link | `/r/$slug` | `/api/public/links/:slug` | `public` | prospective carriers |
| Driver | `/d` (separate app) | `/api/driver/...` | `driver` | drivers |

- `/` lists the user's memberships from `/api/me` and redirects when there is exactly one. The last used org is remembered in `localStorage`.
- Each area has a layout route (`platform/route.tsx`, `t/$orgId/route.tsx`, `c/$orgId/route.tsx`) owning the sidebar, the org switcher and the error boundary.

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
