# Design

## Context

- **Tenant list today.** `GET /api/platform/tenants` (`core/platform/routes.platform.ts`, op `core.platform.listTenants`) returns `{ items: TenantSummary[] }` for every tenant, ordered by `org.name`. `listTenants` in `core/platform/tenants.ts` loads all tenant rows and calls `usageOf` (`core/platform/usage.ts`), which runs one statement per tenant as that tenant with the system actor `usage` (sites, docks and bookings have no platform policy, ADR-0002). The route declares no response type and is on `apps/api/openapi.allowlist.json`. `TenantList` already exists in `packages/shared/src/modules/core/api.platform.ts` and is used only by the web query and `platform.test.ts`.
- **Web today.** `apps/web/src/routes/platform/tenants/index.tsx` renders a shadcn `Table` from `tenantsQuery` (`modules/core/queries.ts`, key `['platform', 'tenants']`). `overrides.tsx`, `$tenantId.tsx` and the create dialog invalidate that key with `exact: true`. `$tenantId.tsx` loads with `useQuery` and no loader, so an unknown id shows a skeleton forever. Other screens already keep state in search params with a zod `validateSearch` and `.catch()` per field (`t/$orgId/reports/index.tsx`), and the site view already has its tabs as child routes (`t/$orgId/sites/$siteId/route.tsx` with `hours.tsx` and `load-types.tsx`).
- **Paging today.** `docs/reference/api-routes.md` "Pagination": unbounded streams use `?limit&cursor` with `{ items, nextCursor }`; master-data lists return `{ items }` unpaged. The cursor helpers are copied three times (`booking/lifecycle/view.ts`, `safety/register/acknowledgements.ts`, `report/kpi/kpis.ts`).
- **Value sets.** The planned sets follow ADR-0019: one self-keyed `as const` object and its type per set. `SortOrder` (`asc`, `desc`) is cross-cutting and lives in `packages/shared/src/values/list.ts`, exported from `@rampflow/shared/values`. `TenantSortKey` (`name`, `createdAt`) lives in `packages/shared/src/modules/core/values.ts`. Sort keys and facet values are passed to `defineList` as these sets, never as string arrays. The page sizes are numbers, not a string set, so `pageSizes` stays a numeric tuple in `contract/list.ts`. SQL below is written as plain SQL for reading; Drizzle code uses set members (`OrgKind.tenant`).
- **Constraints.** No data model change (brief, model ownership). `packages/shared/src/index.ts` is frozen; shared code is imported by path through the `"./*"` export. Response types must be named types in `packages/shared/src/modules/<id>/api*.ts` (ADR-0013); the converter refuses a declared reference with type arguments, so each list needs its own named type. Office screens target 1920 × 1080. The research note (`docs/explanation/research/tech-architecture.md`) records that the shadcn data-table guide now uses TanStack Table v9 (`useTable`, `@tanstack/react-table@9.3.1`) and that the guide is not a registry item.

## Goals / Non-Goals

**Goals:**
- One list contract (query, response, URL) that later lists adopt by declaring their sort keys and facets, without new helpers.
- The tenant list stays fast as tenants grow: work per request is bounded by the page size.
- An ADR that 02 to 04 and later changes follow for lists and entity views.

**Non-Goals:**
- Moving other lists (staff, carriers, sites, briefings, carrier bookings, acknowledgements) to the data table. They adopt it when they are next changed (ADR-0015).
- Replacing the cursor paging of the streams or deduplicating its three helpers.
- Building any of the missing entity views listed in ADR-0015, or the tenant detail tabs (04).
- New tenant fields such as status, tax id, flags or last activity (02, 04). `createdAt` is the existing `org.created_at`.
- Multi-column sort, column visibility, row selection and bulk actions.
- Accent-insensitive or fuzzy search; it needs the `unaccent` or `pg_trgm` extension, a data model change.

## Decisions

### 1. Page-number paging with a total for data tables; cursors stay for streams

Data-table lists take `page` (1 to 10000) and `pageSize` (10, 25, 50, 100; default 25) and answer `{ items, total, page, pageSize }`. The server reads `count(*)` and the page with `limit pageSize offset (page - 1) * pageSize`.

Why: an office table shows "26–50 of 132", jumps to a page and sorts by any declared column. A page number in the URL is readable and stays meaningful when the link is shared. Keyset cursors need one cursor encoding per sort column and direction, cannot jump or show a total without a separate count, and an opaque cursor in a shared link is useless once the data changed.

Alternatives: cursor paging as in `api-routes.md` (rejected for the reasons above; it stays right for append-only streams that are read as "load more"); infinite scroll (not deep-linkable, no total, poor for keyboard users). Cost: `OFFSET` scans skipped rows, which is bounded by the page cap and by the size of master-data lists; inserts between two page reads can shift a row across a page boundary, which is acceptable for admin lists and documented in ADR-0015.

### 2. The list contract in `packages/shared/src/contract/list.ts`

The contract is cross-module, like `contract/settings.ts` and `contract/entitlements.ts`, so it sits in `contract/` and is imported as `@rampflow/shared/contract/list`. Sketch:

```ts
export const pageSizes = [10, 25, 50, 100] as const; // numbers, not a value set

type ValueSet = Readonly<Record<string, string>>;
export interface ListSpec<S extends string, F extends Record<string, ValueSet>> {
  sort: Readonly<Record<string, S>>;     // the list's sort key set, e.g. TenantSortKey
  defaultSort: S;
  defaultOrder: SortOrder;               // from @rampflow/shared/values
  facets: F;                             // facet name → value set, e.g. { package: PackageId }
}
/** The parsed state: q '' = no search; every facet a list of its values, [] = no filter. */
export type ListState<L> = ...;          // { q, sort, order, page, pageSize } & { [facet]: value[] }
export function defineList<S, F>(spec: ListSpec<S, F>): {
  spec; defaults: ListState;
  query: z.ZodType<ListState>;           // API: strict object, strings coerced, 422 on anything invalid
  search: z.ZodType<ListState>;          // web: each field .catch(default), unknown facet values dropped
  toQuery(state: ListState): Record<string, string>; // facets joined by ',', defaults omitted
};
export interface ListPage<T> { items: T[]; total: number; page: number; pageSize: number }
```

- **Encoding.** Facets are one comma-separated param each (`package=start,pro`) in both the URL and the API query. Facet values are enum ids without commas. Hono's query validator yields an array for repeated keys and TanStack Router's default serializer writes arrays as JSON, so comma-separated strings are the one encoding both ends read the same way. `toQuery` is the single writer: the web uses it for the `hc` call and as the input of `navigate({ search })`.
- **Two schemas, one output type.** The API must reject bad input with zod paths (AGENTS.md "Errors"); a link from an older release or a hand-edited URL must still open the list. Both schemas come from one `ListSpec`, so they cannot drift. `query` coerces `page` and `pageSize` from strings; `search` also accepts the numbers TanStack Router parses from the URL.
- **`q`.** Trimmed, at most 100 characters, `''` when absent.

Alternatives: one schema for both ends (rejected: either the API accepts garbage or old links break); zod codecs with `z.encode` (works, but the web side would need both input and output types in TanStack's search typing for no gain over one `toQuery`); arrays in the URL (JSON-encoded, unreadable links).

### 3. Each list declares its own named response type

`TenantList` stays the name and becomes

```ts
export const TenantListQuery = defineList({
  sort: TenantSortKey, defaultSort: TenantSortKey.name, defaultOrder: SortOrder.asc,
  facets: { package: PackageId },
});
export interface TenantList extends ListPage<TenantSummary> {
  facets: { package: Record<PackageId, number> };
}
```

`TenantSummary` gains `createdAt: string` (ISO instant of `org.created_at`). The route declares `responses: { 200: type<TenantList>() }`, validates with `validate('query', TenantListQuery.query)`, and `core.platform.listTenants` leaves the allowlist. `type<TenantList>()` names an interface without type arguments, which the converter accepts; it inlines the inherited `ListPage` members. If the converter cannot read the heritage clause, the fallback is to spell the four members out in `TenantList` (task 2.4 checks this).

### 4. Facet counts ignore the facet's own selection

For each facet the server counts rows per value under the search and every *other* facet, with zero for values without rows. This is the usual faceted-search rule: the counts tell the admin what selecting another value would add. One grouped query per facet; the tenant list has one facet. Later lists (status and flags in 02 and 04) add facets to the same mechanism.

### 5. SQL fragments in `apps/api/src/kernel/list.ts`, the service owns its queries

```ts
export function contains(q: string, ...columns: AnyColumn[]): SQL | undefined; // ILIKE with \ escape
export function orderBy<S extends string>(state: { sort: S; order: SortOrder },
  columns: Record<S, AnyColumn | SQL>, id: AnyColumn): SQL[];                // sort column, then id asc
export function pageWindow(state: { page: number; pageSize: number }): { limit: number; offset: number };
export function facetCounts<V extends string>(members: readonly V[], rows: { value: V; count: number }[]): Record<V, number>;
export function pageOf<T>(state, total: number, items: T[]): ListPage<T>;
```

`contains` escapes `\`, `%` and `_` and uses `ILIKE ... ESCAPE '\'`, matching the spec's literal-wildcard scenario. The tie-break on `id` makes paging deterministic when sort values repeat.

A list service composes these with its own `where`, joins and post-processing. Why not a generic list executor that runs the count, facet and page queries itself: the tenant list computes usage after paging and joins `tenant_subscription`; later lists add RLS-scoped joins and site filters. An executor would need hooks for each, so plain fragments keep each service readable and the kernel small. The fragments live in the kernel next to `validate.ts` because every module's routes use them.

`listTenants(tx, state, now)` builds `where = kind = 'tenant' and contains(q, org.name) and package in (...)` (in code `eq(org.kind, OrgKind.tenant)`), runs `count(*)`, one `group by tenant_subscription.package` without the package condition, counted with `facetCounts(values(PackageId), rows)`, and the page with `orderBy(state, { name: org.name, createdAt: org.createdAt }, org.id)`. It then calls `usageOf` for the page rows only, so the per-tenant statements are bounded by `pageSize` instead of the number of tenants. `tenantDetail` keeps its own single-row path.

### 6. The web `DataTable` follows the shadcn guide on TanStack Table v9

`@tanstack/react-table` 9.3.1 is added to `apps/web` with an exact pin (shared-files rule). The shadcn data-table is a guide, not a registry item; every building block it uses is already installed (`table`, `input-group`, `popover`, `command`, `checkbox`, `badge`, `select`, `button`, `separator`, `empty`, `skeleton`, `spinner`). A block that is missing when the work starts is added with `pnpm dlx shadcn@latest add <component>` from `apps/web`.

Files under `apps/web/src/components/data-table/` (cross-module, like `plan-board/`):

- `data-table.tsx`: `useTable` with only the core row model and manual sorting, filtering and pagination; `rowCount` from `total`. Renders the frame with horizontal scroll, the header, the body, placeholder rows on first load, the error state with retry, and the two empty states with `Empty`.
- `data-table-column-header.tsx`: a ghost `Button` with an arrow icon per direction (`ArrowUp`, `ArrowDown`, `ChevronsUpDown`) and the header cell's `aria-sort`; non-sortable columns render plain text.
- `data-table-toolbar.tsx`: labelled search `InputGroup` with a search icon, one faceted filter per facet, "Clear filters" when any criterion is set, and a spinner while fetching.
- `data-table-faceted-filter.tsx`: the guide's `Popover` + `Command` filter with a checkbox glyph, label and count per value; the trigger shows the selected values as `Badge` text (up to two, then "N selected").
- `data-table-pagination.tsx`: the range "26–50 of 132" in an `aria-live="polite"` element, the page size `Select`, and first, previous, next and last buttons with accessible names.
- `use-list-state.ts`: reads the route's search, returns the `ListState` and setters. Facet, sort, page and page size changes navigate with a push; criteria changes drop `page`. The search input commits after 300 ms idle; the first commit of a typing run pushes and later commits replace, so one back press undoes the whole search. When `items` is empty, `total > 0` and `page > 1`, it replaces the URL with the last page.

The route declares `validateSearch: TenantListQuery.search` and `search: { middlewares: [stripSearchParams(TenantListQuery.defaults)] }`, so defaults stay out of the URL. Data comes from `useQuery(tenantListQuery(state))` with key `['platform', 'tenants', 'list', toQuery(state)]` and `placeholderData: keepPreviousData`, which keeps the old rows during a fetch; the table sets `aria-busy` while `isFetching`. Mutations invalidate the prefix `['platform', 'tenants', 'list']`. A route loader is not used: it would hold the URL change until the data arrives, and the kept rows already cover the wait.

Columns of the tenant list are declared in the route file; ids equal the sort keys where sortable. "Created" uses `useFormat().instant` (viewer zone with its short name, as for invitation expiry).

Alternatives: a hand-written table without TanStack Table (rejected by the brief and loses the guide's column model); TanStack Table client-side models over all rows (rejected: the server must filter, sort and page).

### 7. Strings

Generic labels go into a new part `packages/i18n/locales/<locale>/core/data-table.json` (search label, clear filters, rows per page, page labels, range, selected count, no match, error and retry) in `en`, `de` and `pl`, the core module's set. Core is the default namespace, so the shared component needs no namespace prop. List-specific labels ("Created", "No tenants match", the search placeholder) go into `core/platform.json`.

### 8. Tenant view loads with a loader

`/platform/tenants/$tenantId` gets `loader: ensureQueryData(tenantQuery(tenantId))`, so a 404 reaches the platform layout's `errorComponent` and renders `NoAccess` (entity-views spec). The rest of the view stays for 04.

### 9. ADR-0015 records the pattern and amends ADR-0011

`docs/decisions/ADR-0015-data-tables-and-entity-views.md` decides:

1. Lists that a user browses use the data table: server-side search, facets, sort and page-number paging; state in the URL with the API's names; the contract in `contract/list.ts`, the fragments in `kernel/list.ts`, the components in `components/data-table/`. Streams keep cursor paging. A list adopts the pattern when it is next changed.
2. Every entity with its own id that users manage on its own has a view at `<list path>/$<entity>Id`; dependent rows (hours, closures, overrides, settings, invitations, duration rules) are edited in their parent's view. Detail tabs are child routes, the first tab is the index route. Tabs that switch between different lists on one page (`/t/$orgId/carriers?tab=`) are list state and stay search params until those lists get their own entries. Unknown or foreign ids show the area's "no access" page.
3. ADR-0011's route map gets these rules next to "Every screen has a nav item or names the screen it is reached from", and its `/platform/tenants` row lists the search params. ADR-0011's status line names the amendment.
4. Backlog, not built here: entities with an id and no view today.

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

## Risks / Trade-offs

- [`OFFSET` and `ILIKE '%q%'` scan rows] → tenants number in the hundreds; page is capped at 10000 and page size at 100. A list that outgrows this gets a `pg_trgm` index in a change that may touch the data model.
- [Count, facet and page queries run as separate statements under Read Committed, so a concurrent insert can make `total` and `items` disagree by one] → acceptable for admin lists; the next fetch corrects it.
- [TanStack Table v9 is new and most examples online are v8 (`useReactTable`)] → follow the shadcn guide's v9 code, pin 9.3.1, and keep the table usage to the core row model and manual state.
- [**BREAKING** response shape of `GET /api/platform/tenants`] → the only client is the web app in the same change; `openapi.gen.json` shows the new shape.
- [Tests share a worker database that accumulates tenants] → API tests and e2e give their tenants a unique name prefix and query with `q=<prefix>`; the existing PL-04 tests change from scanning all items to a `q` query.
- [TanStack Router JSON-quotes a search string that looks like a number or boolean (`q=123` becomes `q=%22123%22`)] → the link still round-trips; the lenient schema reads both forms.
- [Strict API query rejects unknown params] → the web sends only `toQuery(state)`, never the raw URL search.
- [02 and 04 extend the same list and its capability] → `platform-tenant-list` is the capability they modify; `TenantList.facets` takes new facets without changing the contract.

## Migration Plan

No database migration. API and web ship together; the SPA is the only client of the changed route. Rollback is a revert of both. After merge, `pnpm api:docs` output and the shrunk allowlist are part of the change.

## Seed data

No data model change, so no seed change. The dev seed has one tenant (Acme Logistics, Pro); search, the package facet with its counts, sorting and the empty "no match" state all show with it in `pnpm dev`.

## Open Questions

- Should the dev seed add some 30 demo tenants so paging is visible in `pnpm dev` and in the screenshot? Default: no; tests and e2e create their own tenants, and demo tenants would clutter the platform screens other docs show.
- Should the "All tenants" link on the tenant view restore the list's last filters? Default: no; it opens the list at its defaults, and the browser's back button restores the filtered list.
