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

Signups whose email is not verified yet are not tenants and SHALL NOT be listed.

#### Scenario: A row of the list
- **WHEN** the platform admin opens `/platform/tenants?q=<name of Tenant A>`
- **THEN** Tenant A's row shows its name as a link, its status, "Pro", its country, its tax id with the check status, its admin email, its creation date and time with the zone name, its last activity, and four meters

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
- **WHEN** the platform admin types "logist" into the search field
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
The tenant list at `/platform/tenants` SHALL show a Status column with the tenant's status as text ("Onboarding", "Active", "Suspended") next to an icon, and SHALL offer a Status facet with the values Onboarding, Active and Suspended, each with its count of matching tenants. `GET /api/platform/tenants` SHALL return `status` per tenant and accept the facet as `status`.

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
- **WHEN** the platform admin activates the Created header until it shows descending
- **THEN** the URL holds `sort=createdAt&order=desc` and the most recently created tenant is the first row

#### Scenario: Dormant tenants first
- **WHEN** the admin sorts by last activity ascending
- **THEN** the URL holds `sort=lastActivityAt&order=asc`, a tenant last active 40 days ago comes before one active today, and tenants never active come after all others

#### Scenario: Usage columns are not sortable
- **WHEN** the platform admin looks at the usage, tax id and admin email column headers
- **THEN** they are plain text, not buttons, and carry no `aria-sort`

## ADDED Requirements

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
- **THEN** the list shows CZ for that tenant and the Country filter CZ finds it

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
