# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Search tenants by name`
- TO: `### Requirement: Search tenants by name, tax id and admin email`

- FROM: `### Requirement: Sort tenants by name or creation`
- TO: `### Requirement: Sort tenants by the main columns`

## MODIFIED Requirements

### Requirement: Tenant list columns
The tenant list at `/platform/tenants` SHALL show one row per tenant with these columns:
- Tenant: the name, linking to `/platform/tenants/$tenantId`.
- Status.
- Package: the translated package name as text.
- Country.
- Tax id: the value with its check status.
- Admin email.
- Created: the tenant's creation instant in the viewer's time zone with the zone name.
- Last activity.
- One usage meter per usage key (`core.max_sites`, `core.max_docks`, `core.max_internal_users`, `booking.max_bookings_per_month`).
- Actions: the row actions menu.

A click anywhere on the row outside the actions menu SHALL open the tenant hub, as the name link does. Dates and usage numbers SHALL use tabular numerals. Signups whose email is not verified yet are not tenants and SHALL NOT be listed.

#### Scenario: A row of the list
- **WHEN** the platform admin opens `/platform/tenants?view=all&q=<name of Tenant A>`
- **THEN** Tenant A's row shows its name as a link, its status, "Pro", its country, its tax id with the check status, its admin email, its creation date and time with the zone name, its last activity, and four meters

#### Scenario: Row click opens the hub
- **WHEN** the platform admin clicks the Package cell of Tenant A's row
- **THEN** the browser shows `/platform/tenants/<id of Tenant A>`

#### Scenario: Pending signup is not listed
- **WHEN** a person registered a company but has not clicked the verification link yet
- **THEN** the tenant list has no row for that company

### Requirement: Search tenants by name, tax id and admin email
The tenant list SHALL search with the data-table search, case-insensitively and as a substring, in:
- the tenant name;
- the tax id, ignoring spaces, dots, dashes and slashes in both the term and the stored value;
- the email of every `tenant_admin` member and every open `tenant_admin` invitation of the tenant.

A tenant SHALL match when any of these fields matches.

#### Scenario: Find a tenant by part of its name
- **WHEN** the platform admin selects the view "All" and types "logist" into the search field
- **THEN** the list shows the tenants whose name, tax id or admin email contains "logist" in any letter case and no other tenant

#### Scenario: Tax id with spaces
- **WHEN** the admin searches `de 123 456`
- **THEN** a tenant with tax id `DE123456789` is listed

#### Scenario: Second admin's email
- **WHEN** the admin searches `second@acme`
- **THEN** the tenant whose second admin is `second@acme.example` is listed, although its admin email column shows the first admin

#### Scenario: Invited admin
- **WHEN** the admin searches the email of a tenant admin invitation that is still open
- **THEN** the tenant of that invitation is listed

### Requirement: Tenant list shows and filters the tenant status
The tenant list at `/platform/tenants` SHALL show a Status column with the tenant's status as a status badge: text ("Onboarding", "Active", "Suspended") next to an icon, on the tone of the status, and SHALL offer a Status facet with the values Onboarding, Active and Suspended, each with its count of matching tenants. `GET /api/platform/tenants` SHALL return `status` per tenant and accept the facet as `status`.

#### Scenario: Onboarding tenants only
- **WHEN** the platform admin selects Onboarding in the Status filter
- **THEN** the URL holds `status=onboarding` and the list shows only tenants without an activation time that are not suspended

#### Scenario: Status is readable without color
- **WHEN** the list shows a tenant in onboarding next to an active one and a suspended one
- **THEN** each status cell carries its status as text, so the difference does not depend on color

#### Scenario: Two statuses
- **WHEN** the admin selects Onboarding and Suspended in the Status filter
- **THEN** the URL holds `status=onboarding,suspended` and the list shows every onboarding and every suspended tenant, and no active tenant

#### Scenario: Unknown status value
- **WHEN** a client requests `GET /api/platform/tenants?status=paused`
- **THEN** the API answers 422 with an issue at the path of the `status` parameter


### Requirement: Sort tenants by the main columns
The tenant list SHALL sort by name, status, package, country, created or last activity, ascending or descending. The default SHALL be name ascending. Rows without a value (no country, never active) SHALL sort after all others in both directions. The tax id, admin email and usage columns SHALL NOT be sortable.

#### Scenario: Newest tenants first
- **WHEN** the platform admin, in the view "All", activates the Created header until it shows descending
- **THEN** the URL holds `view=all&sort=createdAt&order=desc` and the most recently created tenant is the first row

#### Scenario: Dormant tenants first
- **WHEN** the admin, in the view "All", sorts by last activity ascending
- **THEN** the URL holds `view=all&sort=lastActivityAt&order=asc`, a tenant last active 40 days ago comes before one active today, and tenants never active come after all others

#### Scenario: Usage columns are not sortable
- **WHEN** the platform admin looks at the usage, tax id and admin email column headers
- **THEN** they are plain text, not buttons, and carry no `aria-sort`

### Requirement: Filter tenants by package
The tenant list SHALL offer the facet Package, with the values Start, Pro and Enterprise, each with its count of matching tenants. The counts SHALL follow the search, the other facets and the selected view.

#### Scenario: Only Pro and Enterprise tenants
- **WHEN** the platform admin selects the view "All" and Pro and Enterprise in the Package filter
- **THEN** the URL holds `view=all&package=pro,enterprise`, the list shows only Pro and Enterprise tenants, and the filter button names both selected values

#### Scenario: Counts follow the search
- **WHEN** the platform admin, in the view "All", searches "acme" and opens the Package filter
- **THEN** each package value shows the number of tenants whose name contains "acme" with that package

### Requirement: Paged tenant list
The tenant list SHALL show 25 tenants per page by default, and the admin SHALL choose 10, 25, 50 or 100 per page. The page SHALL count within the selected view. Usage SHALL be counted only for the tenants of the requested page.

#### Scenario: Second page
- **WHEN** 30 tenants exist and the platform admin moves to page 2 of the view "All"
- **THEN** the list shows tenants 26 to 30 in name order and reads "26–30 of 30"

## ADDED Requirements

### Requirement: The tenant list opens on the view "Needs attention"
The tenant list SHALL offer two views as tabs above the table, each with its count of matching tenants:
- "Needs attention": every tenant that is onboarding or suspended, is flagged as a possible duplicate, or has the tax id check status Unverified;
- "All": every tenant.

"Needs attention" SHALL be the default view, so `/platform/tenants` without a `view` parameter shows it. The view SHALL live in the URL as `view` (`attention`, `all`), with the default left out. Search, facets, sort and paging SHALL apply within the selected view. The count of each tab SHALL follow the search and the facets, but not the view. `GET /api/platform/tenants` SHALL accept `view` with the same default and SHALL return the count of each view. A view with no matching tenant SHALL show an empty state that names the view and links to "All".

#### Scenario: Default view
- **WHEN** an onboarding tenant, a suspended tenant, an active tenant flagged as a possible duplicate, an active tenant with an unverified tax id and an active tenant without a flag exist, all named with the prefix "Q7", and the platform admin opens `/platform/tenants?q=Q7`
- **THEN** the tab "Needs attention" is selected and shows the count 4, the tab "All" shows 5, the URL holds no `view` parameter, and the list shows the first four tenants and not the fifth

#### Scenario: Switch to all tenants
- **WHEN** the admin then selects the tab "All"
- **THEN** the URL holds `view=all&q=Q7`, the list shows all five tenants, and the browser's back button returns to "Needs attention"

#### Scenario: Counts follow the search
- **WHEN** the admin searches the name of the active tenant without a flag
- **THEN** the tab "Needs attention" shows 0 and the tab "All" shows 1

#### Scenario: Unknown view
- **WHEN** a client requests `GET /api/platform/tenants?view=urgent`
- **THEN** the API answers 422 with an issue at the path of the `view` parameter

### Requirement: Row actions in a menu
Each row of the tenant list SHALL end with a "…" actions menu, reachable by keyboard and labelled with the tenant name. The menu SHALL hold, in this order:
- "View", which opens the tenant hub;
- a separator;
- "Suspend" for a tenant that is not suspended, shown in the destructive color as the last item, or "Reactivate" for a suspended tenant.

"Suspend" and "Reactivate" SHALL open the same reason sheet as the tenant hub's header. Opening the menu SHALL NOT open the hub.

#### Scenario: Suspend from the list
- **WHEN** the platform admin opens the actions menu of active Tenant A and selects "Suspend"
- **THEN** a side sheet asks for the reason, the list stays visible behind it, and after "Suspend tenant" Tenant A's row shows the status "Suspended"

#### Scenario: Menu of a suspended tenant
- **WHEN** the admin opens the actions menu of a suspended tenant
- **THEN** it offers "View" and "Reactivate", and no "Suspend"

### Requirement: Filter tenants by country
The tenant list SHALL offer a Country facet. Its values are the countries a tenant can register with (the 27 EU member states) and "Not set", each with its count of matching tenants. Only values with a count above zero and the values already selected SHALL be offered. `GET /api/platform/tenants` SHALL accept the facet as `country`, with `none` for "Not set".

#### Scenario: Tenants without a country
- **WHEN** the platform admin selects "Not set" in the Country filter
- **THEN** the URL holds `country=none` and only tenants without a country are listed

#### Scenario: Facets combine
- **WHEN** the admin selects Pro in the Package filter and AT in the Country filter
- **THEN** only Pro tenants with country AT are listed

### Requirement: Filter tenants by flags
The tenant list SHALL offer a Flags facet with the values "Possible duplicate" (the tenant was flagged at registration) and "Tax id unverified" (tax id check status Unverified), each with its count. Selected values SHALL combine with OR. `GET /api/platform/tenants` SHALL accept the facet as `flag` with the values `possible_duplicate` and `tax_id_unverified`.

#### Scenario: Both flags
- **WHEN** the admin selects both flags
- **THEN** the list shows every tenant that is a possible duplicate or has an unverified tax id, and no other

### Requirement: A tenant's country is the registered country and can be corrected
A tenant's country SHALL be the ISO 3166-1 alpha-2 code stored on the tenant: the country entered at registration, or the one the platform admin set. The platform admin SHALL be able to change or clear it. A tenant without a country SHALL show "Not set". The country SHALL NOT be derived from the tenant's sites.

#### Scenario: Registered country
- **WHEN** a company registers with the country AT
- **THEN** the tenant list shows AT for the new tenant

#### Scenario: Correction by the platform admin
- **WHEN** the platform admin sets the country of a tenant created through PL-01 to CZ
- **THEN** the list shows CZ for that tenant and the Country filter CZ finds it in the view "All"

### Requirement: The tax id column shows the value and its check status
The tax id column SHALL show the tax id as stored and its check status: Pending, Verified, Unverified or Unavailable. A tenant without a tax id SHALL show "None". Each status SHALL have a distinct text label.

#### Scenario: VIES answered invalid
- **WHEN** the VIES check of a tenant's EU VAT id answered "invalid"
- **THEN** the row shows the tax id with the label "Unverified"

### Requirement: The admin email names the first tenant admin
The admin email SHALL be the email of the tenant's earliest `tenant_admin` member. A tenant without an admin member SHALL show the email of its newest open `tenant_admin` invitation, marked "Invited". A tenant with neither SHALL show an empty cell.

#### Scenario: Tenant created by the platform, invitation not accepted yet
- **WHEN** the platform admin created a tenant with admin email `boss@new.example` and the invitation is still open
- **THEN** the row shows `boss@new.example` marked "Invited"

#### Scenario: Two admins
- **WHEN** a tenant has the admin `first@acme.example` (joined in January) and `second@acme.example` (joined in March)
- **THEN** the row shows `first@acme.example`

### Requirement: Last activity is the latest use of the app by a tenant member
A tenant's last activity SHALL be the latest instant at which any member of the tenant signed in or made a signed-in request. It SHALL lag behind by at most 5 minutes. A tenant whose members never signed in SHALL show "Never". The list SHALL show the time relative to now, and the exact instant with the zone name on hover and focus.

#### Scenario: Sign-in updates last activity
- **WHEN** a dispatcher of tenant A signs in at 09:00 UTC
- **THEN** tenant A's last activity is 09:00 UTC

#### Scenario: Requests keep it current
- **WHEN** the same dispatcher keeps working until 11:42 UTC
- **THEN** tenant A's last activity is between 11:37 and 11:42 UTC

#### Scenario: No member ever signed in
- **WHEN** a tenant has only an open admin invitation
- **THEN** its last activity reads "Never"
