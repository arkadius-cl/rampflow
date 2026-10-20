---
title: ADR-0015 Data tables with URL state, and one view per entity
description: Why lists search, filter, sort and page on the server with page numbers and keep that state in the URL, how the list contract, the API fragments and the web DataTable fit together, and the rule that every managed entity has its own deep-linkable view with tabs as child routes.
type: explanation
audience: [agent, developer]
tags: [adr, frontend, routing, api, lists, ux]
status: stable
updated: 2026-10-20
related: [docs/decisions/ADR-0011-frontend-routes-and-org-context.md, docs/decisions/ADR-0013-openapi-from-routes-and-typescript.md, docs/reference/api-routes.md, docs/explanation/ux-concept.md]
---

# ADR-0015: Data tables with URL state, and one view per entity

Status: accepted, 2026-10-20. Amends [ADR-0011](ADR-0011-frontend-routes-and-org-context.md).

## Context

The product owner decided that lists use one data table with search, filter and sort, run on the server, with the table state in the URL so a filtered list is a deep link. The same decision says every entity with its own id gets its own deep-linkable view, with detail tabs as child routes.

Before this decision every list was a hand-built shadcn `Table` that rendered all rows the API returned. The platform tenant list (PL-04) returned every tenant and counted usage with one statement per tenant, so it slowed down with each tenant. The streams (bookings, booking events, acknowledgements) already paged with cursors; master-data lists were unpaged.

## Options considered

| Question | Option | Verdict |
|---|---|---|
| Paging | Keyset cursors, as the streams use | One cursor encoding per sort column and direction, no jump to a page, no total without a second count, and an opaque cursor in a shared link means nothing once the data changed. Right for append-only streams read as "load more". |
| | Infinite scroll | Not deep-linkable, no total, poor for keyboard users. |
| | **Page numbers with a total** | "26–50 of 132", jump to any page, a readable `page=3` in a shared link. `OFFSET` scans the skipped rows, bounded by the page cap and the size of master-data lists. |
| Query schemas | One schema for the API and the URL | Either the API accepts garbage, or a link from an older release breaks the screen. |
| | **Two schemas from one list spec** | The API rejects bad input with zod paths (422); the URL falls back to defaults. Both come from one spec, so they cannot drift. |
| Server code | A generic list executor that runs count, facets and page | Needs hooks for joins, RLS-scoped filters and post-processing such as usage counts. |
| | **SQL fragments the service composes** | Each service keeps its own queries readable; the kernel stays small. |

## Decision

### 1. Lists that users browse are data tables

- **Query.** Every data-table list accepts `q` (search text, at most 100 characters, trimmed), `sort` (one of the list's sortable columns), `order` (`asc` or `desc`), one comma-separated parameter per facet (`package=start,pro`), `page` (1 to 10000) and `pageSize` (10, 25, 50 or 100). All are optional and default per list.
- **Response.** `{ items, total, page, pageSize }` plus the list's facet counts, for example `facets: { package: { start, pro, enterprise } }`. `total` counts the rows matching the search and every facet. A facet's counts ignore that facet's own selection, so they tell what choosing another value would add. A page past the end answers 200 with no items.
- **Rules.** Search is a case-insensitive substring over the list's search columns; `%`, `_` and `\` match themselves. Rows with equal sort values are ordered by id, so consecutive pages neither repeat nor skip a row while the data does not change. A row inserted between two page reads can shift across a page boundary, which is acceptable for admin lists.
- **Invalid input.** The API answers 422 `validation_failed` with the zod path of each invalid or unknown parameter. The web replaces each invalid search param with its default, drops unknown facet values, and rewrites the URL to its canonical form.
- **Contract.** `packages/shared/src/contract/list.ts`: `defineList({ sort, defaultSort, defaultOrder, facets })` returns `query` (strict, API), `search` (lenient, web), `defaults`, `toQuery` (strings for the `hc` call), `toSearch` (the URL; numbers stay numbers so the router writes `page=2`) and `canonical`. Sort keys and facet values are value sets ([ADR-0019](ADR-0019-central-value-sets.md)). Each list declares a named response type that extends `ListPage<T>`, as [ADR-0013](ADR-0013-openapi-from-routes-and-typescript.md) requires.
- **API.** `apps/api/src/kernel/list.ts`: `contains`, `orderBy`, `pageWindow`, `facetCounts` and `pageOf`. Work that runs per row, such as usage counts, runs for the page rows only.
- **Web.** `apps/web/src/components/data-table/`, after the shadcn data-table guide on TanStack Table v9 (manual sorting and pagination): toolbar with a labelled search and faceted filters, sortable headers with `aria-sort`, pagination with a polite live range and a page size select, placeholder rows on first load, the previous rows with `aria-busy` while the next page loads, an error with retry, and two empty states (none yet, no match). `use-list-state.ts` keeps the state in the route's search params: facet, sort, page and page size changes push a history entry; a typing run in the search field pushes one entry and replaces it afterwards; criteria changes return to page 1. The route sets `validateSearch: List.search` and the `canonicalSearch(List)` middleware.
- **Streams keep cursors.** Bookings, booking events and acknowledgements keep `?limit&cursor` with `{ items, nextCursor }`.
- **Adoption.** A list adopts the data table when it is next changed. Until then, master-data lists return `{ items }`.

### 2. Every managed entity has its own view

- Every entity with its own id that users create, open or manage on its own has a detail view at `<list path>/$<entity>Id`. Rows of a list link to it with a real link, so it opens with a click, with Enter and in a new tab.
- Rows that exist only as part of a parent and are edited in the parent's view need no view of their own: opening hours, closures, entitlement overrides, setting values, invitations, duration rules.
- A detail view with tabs makes each tab a child route `<detail path>/<tab>`; the first tab is the index route at the detail path. Selecting a tab changes the URL and adds a history entry.
- Tabs that switch between different lists on one page (`/t/$orgId/carriers?tab=`) are list state and stay search params until those lists get their own entries.
- An unknown or foreign id shows the area's "no access" page inside the shell. It never redirects to another entity and never reveals whether the id exists. A view loads its entity in a route `loader`, so a 404 reaches an error component instead of a loading placeholder.
- Entity and tab URLs keep the sign-in redirect: opened without a session, they lead to sign-in and back to the same URL.

### 3. Amendment to ADR-0011

ADR-0011's route map rules gain the entity-view and detail-tab rules next to "Every screen has a nav item or names the screen it is reached from", and its `/platform/tenants` row lists the list's search params.

### 4. Backlog

Entities with an id and no view of their own today. None is built by this decision; each gets its view when its screen is next changed.

| Entity | Today | Future view |
|---|---|---|
| Carrier (tenant side) | row in `/t/$orgId/carriers?tab=linked` | `/t/$orgId/carriers/$carrierId` |
| Dock | row in the hall card on `/t/$orgId/sites/$siteId` | `/t/$orgId/sites/$siteId/docks/$dockId` |
| Hall | card on `/t/$orgId/sites/$siteId` | `/t/$orgId/sites/$siteId/halls/$hallId` |
| Staff user | row in `/t/$orgId/staff` | `/t/$orgId/staff/$userId` |
| Carrier user | row in `/c/$orgId/users` | `/c/$orgId/users/$userId` |
| Package | column in `/platform/packages` | `/platform/packages/$packageId` |
| Carrier's linked tenant | row in `/c/$orgId/tenants` | `/c/$orgId/tenants/$tenantId` |
| Bookable resource | pool editor on `/t/$orgId/sites/$siteId` | `/t/$orgId/sites/$siteId/resources/$resourceId` |
| Load type | row in `/t/$orgId/sites/$siteId/load-types` | `/t/$orgId/sites/$siteId/load-types/$loadTypeId` |

To classify when next touched: carrier registration, public booking link, safety version, safety acknowledgement, privacy request.

## Consequences

- A filtered, sorted page of a list is a link that opens the same rows for another user, and back and forward walk through the list states.
- Per-request work of a data-table list is bounded by the page size. The first adopter, the platform tenant list, counts usage for 25 tenants by default instead of all of them.
- Count, facet and page run as separate statements under Read Committed, so a concurrent insert can make `total` and `items` disagree by one until the next fetch.
- Search uses `ILIKE '%q%'` without an index. A list that outgrows this gets a `pg_trgm` index in a change that may touch the data model; accent-insensitive search needs `unaccent`, also a data model change.
- `GET /api/platform/tenants` changed its response from all tenants to a page. Its only client, the web app, changed with it.
