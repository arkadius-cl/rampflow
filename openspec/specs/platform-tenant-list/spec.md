# platform-tenant-list Specification

## Purpose

Defines the platform admin's tenant list (PL-04): which tenants and columns it shows, how the admin finds a tenant by name or package and orders the list, and the actions it offers.

## Requirements

### Requirement: Tenant list columns
The tenant list at `/platform/tenants` SHALL show one row per tenant with the columns Tenant (the name, linking to `/platform/tenants/$tenantId`), Package (the translated package name as text), Created (the tenant's creation instant in the viewer's time zone with the zone name), and one usage meter per usage key (`core.max_sites`, `core.max_docks`, `core.max_internal_users`, `booking.max_bookings_per_month`).

#### Scenario: A row of the list
- **WHEN** the platform admin opens `/platform/tenants?q=<name of Tenant A>`
- **THEN** Tenant A's row shows its name as a link, "Pro", its creation date and time with the zone name, and four meters

### Requirement: Usage meters against limits
Each meter SHALL show the used count against the tenant's limit with the percentage, and a soft limit above 100 % SHALL read "soft limit exceeded" in text next to a warning icon and block nothing. Usage SHALL be counted as before: active sites, active and maintenance docks, members plus invitations that still work, and bookings created since the first of the UTC month.

#### Scenario: Soft limit above 100 %
- **WHEN** Tenant A has 3 bookings this month and an override sets `booking.max_bookings_per_month` to 2
- **THEN** its bookings meter reads "3 / 2" and "150 %, soft limit exceeded", and Tenant A can still book

### Requirement: Search tenants by name
The tenant list SHALL search the tenant name with the data-table search.

#### Scenario: Find a tenant by part of its name
- **WHEN** the platform admin types "logist" into the search field
- **THEN** the list shows the tenants whose name contains "logist" in any letter case and no other tenant

### Requirement: Filter tenants by package
The tenant list SHALL offer one facet, Package, with the values Start, Pro and Enterprise, each with its count of matching tenants.

#### Scenario: Only Pro and Enterprise tenants
- **WHEN** the platform admin selects Pro and Enterprise in the Package filter
- **THEN** the URL holds `package=pro,enterprise`, the list shows only Pro and Enterprise tenants, and the filter button names both selected values

#### Scenario: Counts follow the search
- **WHEN** the platform admin searches "acme" and opens the Package filter
- **THEN** each package value shows the number of tenants whose name contains "acme" with that package

### Requirement: Sort tenants by name or creation
The tenant list SHALL sort by name or by creation instant, ascending or descending, and SHALL default to name ascending. The package and usage columns SHALL NOT be sortable.

#### Scenario: Newest tenants first
- **WHEN** the platform admin activates the Created header until it shows descending
- **THEN** the URL holds `sort=createdAt&order=desc` and the most recently created tenant is the first row

#### Scenario: Usage columns are not sortable
- **WHEN** the platform admin looks at the usage column headers
- **THEN** they are plain text, not buttons, and carry no `aria-sort`

### Requirement: Paged tenant list
The tenant list SHALL show 25 tenants per page by default, and the admin SHALL choose 10, 25, 50 or 100 per page. Usage SHALL be counted only for the tenants of the requested page.

#### Scenario: Second page
- **WHEN** 30 tenants exist and the platform admin moves to page 2
- **THEN** the list shows tenants 26 to 30 in name order and reads "26–30 of 30"

### Requirement: Create a tenant from the list
The tenant list SHALL keep the "Create tenant" action in its page header, whatever the search, filter, sort or page. Creating a tenant SHALL open the new tenant's view, and the list SHALL include the tenant the next time it is shown.

#### Scenario: Create from a filtered list
- **WHEN** the platform admin has the list filtered to Enterprise and creates the tenant "Acme" with package Pro
- **THEN** the browser shows Acme's tenant view, and going back to the list and clearing the filter shows Acme

#### Scenario: Empty platform
- **WHEN** no tenant exists and no search or filter is set
- **THEN** the list shows "No tenants yet." and the "Create tenant" action

### Requirement: Only platform admins read the tenant list
`GET /api/platform/tenants` and `/platform/tenants` SHALL require the permission `core.manage_tenants` of the platform party. A user without the platform party SHALL get 404 from the API and the "no access" page in the web app, whatever the list query.

#### Scenario: Tenant admin calls the platform list
- **WHEN** a tenant admin calls `GET /api/platform/tenants?q=Tenant`
- **THEN** the response is 404 and holds no tenant
