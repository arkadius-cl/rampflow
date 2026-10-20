# Spec Delta

## Purpose

Defines how lists in the web app search, filter, sort and page on the server and keep that state in the URL, so every filtered list is a shareable deep link and behaves the same on every screen.

## ADDED Requirements

### Requirement: One list query shape
Every list route that backs a data table SHALL accept the query parameters `q` (search text), `sort` (one of the list's sortable columns), `order` (`asc` or `desc`), one parameter per facet of the list, `page` and `pageSize`. Every parameter SHALL be optional; an omitted parameter takes the list's default.

#### Scenario: All parameters omitted
- **WHEN** the platform admin calls `GET /api/platform/tenants` without query parameters
- **THEN** the response is 200 with the first page of 25 tenants in the list's default sort

#### Scenario: All parameters given
- **WHEN** the platform admin calls `GET /api/platform/tenants?q=acme&package=pro&sort=createdAt&order=desc&page=2&pageSize=10`
- **THEN** the response is 200 with the second page of 10 tenants whose name contains "acme" and whose package is Pro, newest first

### Requirement: Invalid list queries are rejected by the API
The API SHALL answer 422 `validation_failed` with the zod path of the parameter when `sort` is not a sortable column of the list, `order` is neither `asc` nor `desc`, a facet value is not one of the facet's values, `page` is not an integer from 1 to 10000, `pageSize` is not 10, 25, 50 or 100, or `q` is longer than 100 characters. Unknown parameters SHALL be rejected the same way.

#### Scenario: Unsupported page size
- **WHEN** the platform admin calls `GET /api/platform/tenants?pageSize=7`
- **THEN** the response is 422 with an issue at the path `["pageSize"]`

#### Scenario: Unknown sort column
- **WHEN** the platform admin calls `GET /api/platform/tenants?sort=usage`
- **THEN** the response is 422 with an issue at the path `["sort"]`

#### Scenario: Unknown facet value
- **WHEN** the platform admin calls `GET /api/platform/tenants?package=gold`
- **THEN** the response is 422 with an issue whose path starts with `["package"]`

### Requirement: Search matches a case-insensitive substring
The server SHALL trim `q`, treat an empty `q` as no search, and keep the rows where any of the list's search columns contains `q` regardless of letter case. The characters `%`, `_` and `\` in `q` SHALL match themselves, not act as wildcards.

#### Scenario: Case-insensitive match
- **WHEN** tenants "Acme Logistics" and "Beta Freight" exist and the admin searches `ACME`
- **THEN** the result holds "Acme Logistics" and not "Beta Freight"

#### Scenario: Wildcard characters are literal
- **WHEN** tenants "100% Cargo" and "1000 Cargo" exist and the admin searches `100%`
- **THEN** the result holds "100% Cargo" and not "1000 Cargo"

### Requirement: Facet filters select values
A facet parameter SHALL carry one or more of the facet's values separated by commas. A row SHALL match a facet when its value is one of the given values. A row SHALL be in the result only when it matches the search and every given facet.

#### Scenario: Two values of one facet
- **WHEN** the admin calls the tenant list with `package=start,pro`
- **THEN** the result holds Start and Pro tenants and no Enterprise tenant

#### Scenario: Search and facet combined
- **WHEN** the admin calls the tenant list with `q=acme&package=pro`
- **THEN** every row's name contains "acme" and every row's package is Pro

### Requirement: Facet counts
The response SHALL carry, for every facet of the list and every value of that facet, the number of rows that match the search and every other given facet, ignoring the facet's own selection. A value without matching rows SHALL count 0.

#### Scenario: Counts ignore the facet's own selection
- **WHEN** 2 Start, 1 Pro and 0 Enterprise tenants contain "acme" and the admin calls the list with `q=acme&package=pro`
- **THEN** `facets.package` is `{ "start": 2, "pro": 1, "enterprise": 0 }` and `items` holds the 1 Pro tenant

### Requirement: Sorting is deterministic
The server SHALL order rows by the `sort` column in `order` direction, and rows with equal sort values by their id ascending, so consecutive pages neither repeat nor skip a row while the data does not change. Each list SHALL declare its default sort column and direction.

#### Scenario: Pages do not overlap
- **WHEN** 12 tenants share the same name prefix and the admin reads pages 1 and 2 with `pageSize=10` sorted by name
- **THEN** the two pages hold 12 different tenants together

#### Scenario: Descending order
- **WHEN** the admin calls the tenant list with `sort=createdAt&order=desc`
- **THEN** every tenant is created at or after the tenant on the next row

### Requirement: Page-number paging with a total
The response SHALL be `{ items, total, page, pageSize }` plus the list's facet counts, where `total` is the number of rows that match the search and all facets. A `page` beyond the last page SHALL answer 200 with no items and the same `total`.

#### Scenario: Total and page
- **WHEN** 132 tenants match and the admin requests `page=2&pageSize=50`
- **THEN** `items` holds rows 51 to 100, `total` is 132, `page` is 2 and `pageSize` is 50

#### Scenario: Page beyond the end
- **WHEN** 12 tenants match and the admin requests `page=5&pageSize=10`
- **THEN** the response is 200 with `items` empty and `total` 12

### Requirement: Table state lives in the URL
The data table's search, facet selections, sort, order, page and page size SHALL be the screen's URL search params, written with the same names and encoding as the API query. Parameters at their default SHALL be left out of the URL. Opening the URL SHALL show the same rows in the same state.

#### Scenario: Deep link
- **WHEN** the admin filters the tenant list to Pro, sorts by created date descending and copies the URL `/platform/tenants?package=pro&sort=createdAt&order=desc`
- **THEN** another platform admin who opens that URL sees the Pro filter selected, the created column sorted descending and the same rows

#### Scenario: Default state has a clean URL
- **WHEN** the tenant list is sorted by its default and shows 25 rows, and the admin activates "Clear filters"
- **THEN** the URL is `/platform/tenants` without search params

### Requirement: Back and forward restore the list
Each change of a facet selection, the sort, the page or the page size SHALL add a browser history entry. A search SHALL add one history entry when the typing starts and update that entry while the typing continues. Going back or forward SHALL restore the list state of that entry.

#### Scenario: Back after a filter
- **WHEN** the admin selects the facet value Pro and then presses the browser's back button
- **THEN** the URL has no `package` param and the list shows all packages again

#### Scenario: Back after a search
- **WHEN** the admin types "acme" into the search field letter by letter and then presses back once
- **THEN** the search field is empty and the list shows the state before the search

### Requirement: Outdated links fall back to defaults
The web app SHALL NOT fail on an invalid search param in a data-table URL. It SHALL replace each invalid param with its default and drop invalid facet values, and then show the list.

#### Scenario: Removed facet value
- **WHEN** the admin opens `/platform/tenants?package=gold,pro&pageSize=7`
- **THEN** the list shows the Pro filter selected and 25 rows per page

### Requirement: Changing criteria returns to the first page
Changing the search, a facet selection or the page size SHALL show page 1. When a page beyond the last is shown because rows disappeared, the table SHALL move to the last page that has rows, without adding a history entry.

#### Scenario: Filter on page 3
- **WHEN** the admin is on page 3 of the tenant list and selects the facet value Enterprise
- **THEN** the URL has no `page` param and the table shows the first page of Enterprise tenants

### Requirement: Loading and error states
On first load the table SHALL show its header and placeholder rows instead of data. While a new page or a changed criterion loads, the table SHALL keep the previous rows visible, mark the table busy for assistive technology and show a loading indicator. A failed request SHALL show an error message with a retry action in place of the rows.

#### Scenario: Paging keeps the old rows until the new ones arrive
- **WHEN** the admin moves to page 2 and the response is slow
- **THEN** the page 1 rows stay visible with `aria-busy="true"` on the table until page 2 arrives

### Requirement: Two empty states
When no row matches and no search or facet is set, the table SHALL show the list's "none yet" message with its primary action. When no row matches because of the search or a facet, it SHALL show a "no match" message that names the active search or filters and a button that clears search and facets.

#### Scenario: No match
- **WHEN** the admin searches `zzzz` on the tenant list and no tenant matches
- **THEN** the table shows "No tenants match" and a "Clear filters" button, and activating it shows all tenants

### Requirement: Accessible data table
The search field SHALL have a visible label or an accessible name. Every sortable column header SHALL be a button, and the header cell of the sorted column SHALL carry `aria-sort`. The sort direction and the active facet selections SHALL be shown by icon and text, not by color alone. The result range and total SHALL be announced through a polite live region. The screen SHALL have no serious or critical axe violation.

#### Scenario: Sorted header exposes its state
- **WHEN** the tenant list is sorted by name ascending
- **THEN** the "Tenant" header cell has `aria-sort="ascending"` and its button shows an ascending arrow icon

#### Scenario: Result count is announced
- **WHEN** the admin selects the facet value Pro and 3 tenants match
- **THEN** a polite live region reads "1–3 of 3"

#### Scenario: Keyboard only
- **WHEN** the admin uses only the keyboard
- **THEN** they can reach and operate the search field, each facet filter, each sortable header, the page size select and the paging buttons

### Requirement: Office layout
On a 1920 × 1080 viewport at 100 % zoom the toolbar SHALL fit in one row above the table and the table SHALL show every column of the list without horizontal scrolling. On narrower windows the table SHALL scroll horizontally inside its frame instead of breaking the page.

#### Scenario: Full HD
- **WHEN** the platform admin opens `/platform/tenants?package=pro` at 1920 × 1080
- **THEN** the search field, the package filter and the "Clear filters" button sit in one row and all tenant columns are visible without a horizontal scrollbar
