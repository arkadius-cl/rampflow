# Proposal

## Why

The product owner decided that lists use one data table with search, filter and sort, run on the server, with the table state in the URL so a filtered list is a deep link (shared brief, decisions 1 and 2). Today every list is a hand-built shadcn `Table` that renders all rows the API returns. The platform tenant list (`/platform/tenants`, PL-04) is the first list that grows without bound: `GET /api/platform/tenants` returns every tenant and computes usage with one statement per tenant, so the page slows down with each tenant (the PL-04 e2e already waits up to 60 s for its row). Changes 02 to 04 add tenant status, tax id, flags and more columns to this list, so the pattern has to exist before them. The same decision says every entity with its own id gets its own deep-linkable view with detail tabs as child routes; ADR-0011's route map does not say that yet, and several entities have no view of their own.

## What Changes

- **List-query contract in `packages/shared`.** One zod helper builds a list's query schema from its sortable columns and facets: `q`, `sort`, `order`, one comma-separated param per facet, `page`, `pageSize`. A strict variant validates the API query (422 with zod paths); a lenient variant validates the web route's search params, so a hand-edited or outdated link falls back to defaults instead of failing. A generic `ListPage<T>` shape `{ items, total, page, pageSize }` that each list's named response type extends, with per-list facet counts.
- **Page-number paging for data tables.** Data-table lists page by `page` and `pageSize` with a `total`. The cursor paging of the unbounded streams (bookings, events, acknowledgements) stays as it is.
- **Server-side helper in the API kernel.** `apps/api/src/kernel/list.ts` turns a parsed list query into the search condition (case-insensitive substring with escaped wildcards), the order (sort column plus `id` as tiebreaker), the limit and offset, and the `ListPage` result.
- **Reusable `DataTable` in the web app.** Built on `@tanstack/react-table` (new dependency, pinned) following the shadcn data-table guide, composed of existing shadcn components: toolbar with search and faceted filters, sortable column headers, pagination with page size, skeleton loading, two empty states (none yet, none match), live result count. The table state is the route's search params via `validateSearch`; filter, sort and page changes are history entries, so back and forward restore the list.
- **First adopter: `/platform/tenants` (PL-04).** Server-side search by name, filter by package (with counts), sort by name and created date, paging. Usage is computed only for the tenants on the page. The "Create tenant" action stays. The summary gains the existing `org.created_at` as `createdAt` for the sort and a "Created" column; no new tenant fields.
- **`GET /api/platform/tenants`** takes the list query and returns `TenantList` `{ items, total, page, pageSize, facets }` with a named response type, and leaves `apps/api/openapi.allowlist.json`. **BREAKING** for API clients that expect every tenant in one response: the default page holds 25 tenants. The only client is the web app, which changes in the same change.
- **ADR-0015** records the list pattern and the rule "every entity with its own id gets its own deep-linkable view; detail tabs are child routes", amends ADR-0011's route map rules, and lists the entities that lack a detail view today as backlog. No such view is built here.

## Capabilities

### New Capabilities

- `data-table`: how every list in the web app searches, filters, sorts and pages on the server, keeps its state in the URL, and presents loading, empty, error and accessible states.
- `entity-views`: the rule that every entity with its own id has its own deep-linkable view, that detail tabs are child routes, and how lists link to those views.
- `platform-tenant-list`: what the platform tenant list (PL-04) shows and lets the platform admin search, filter and sort, including usage meters and the "Create tenant" action. Changes 02 and 04 extend this capability with status, tax id, flags and further columns.

### Modified Capabilities

None. `api-description` keeps its requirements: the tenant list gains a named response type and leaves the allowlist, which that capability already demands.

## Impact

- **Code:**
  - Shared: new `packages/shared/src/contract/list.ts` (+ `list.test.ts`); new value sets per ADR-0019, `SortOrder` in `packages/shared/src/values/list.ts` and `TenantSortKey` in `packages/shared/src/modules/core/values.ts`; `packages/shared/src/modules/core/api.platform.ts` (`TenantListQuery`, `TenantList` extends `ListPage`, `TenantSummary.createdAt`).
  - API: new `apps/api/src/kernel/list.ts` (+ `list.test.ts`); `apps/api/src/modules/core/platform/tenants.ts` (`listTenants` takes the query), `routes.platform.ts` (`validate('query', ...)`, `type<TenantList>()`), `platform.test.ts`; `apps/api/openapi.allowlist.json` loses `core.platform.listTenants`; `apps/api/openapi.gen.json` regenerated.
  - Web: new `apps/web/src/components/data-table/` (table, toolbar, faceted filter, column header, pagination, URL-state hook); `apps/web/src/routes/platform/tenants/index.tsx`; `apps/web/src/modules/core/queries.ts` (list query keyed by the search); `apps/web/src/modules/core/overrides.tsx` (invalidate the list prefix); `apps/web/src/routes/platform/tenants/$tenantId.tsx` (invalidate the list prefix, loader so an unknown id shows "no access").
  - Dependency: `@tanstack/react-table` 9.3.1 in `apps/web/package.json`, exact pin; `pnpm-lock.yaml`.
  - i18n: new part `packages/i18n/locales/{en,de,pl}/core/data-table.json`; `core/platform.json` gains the tenant list labels ("Created", "No tenants match", search label).
  - Tests: `platform.test.ts` (PL-04 query behaviour), `kernel/list.test.ts`, `contract/list.test.ts`, `e2e/core/PL-04.spec.ts` (search, facet, sort, paging, deep link, back and forward, axe), `e2e/core/MD-01.spec.ts` and `e2e/core/PL-02.spec.ts` (entity-view URLs, tabs and back, no access, sign-in redirect); `e2e/core/PL-01.spec.ts` unchanged in behaviour.
- **API:** `GET /api/platform/tenants` gains query params and a paged response (see BREAKING above). No other route changes.
- **Data model:** none. No table, column, index, enum or check changes; search uses `ILIKE` without a new index. Seed: no data model change.
- **Docs:**
  - `docs/decisions/ADR-0015-data-tables-and-entity-views.md` (new).
  - `docs/decisions/ADR-0011-frontend-routes-and-org-context.md`: amended by ADR-0015 (route map rule for entity views and detail tabs, list search params on `/platform/tenants`).
  - `docs/reference/api-routes.md`: "Pagination" section describes both paging styles and the list query; the `/api/platform/tenants` row regenerates with `pnpm api:docs`.
  - `docs/explanation/ux-concept.md`: "Lists" interaction pattern, `DataTable` in the component mapping, the platform admin screen.
  - `docs/explanation/mvp-scope.md`: PL-04 names search, package filter, sort and paging.
  - `docs/explanation/architecture-overview.md`: the web app paragraph names the URL-driven data table.
  - `docs/how-to/onboard-a-tenant.md`: find a tenant by name or package; refreshed `docs/assets/screens/platform-tenants.png`.
  - `AGENTS.md`: UI conventions point to ADR-0015 for lists and entity views.
