# platform-tenant-detail Specification

## Purpose

Gives the platform admin one place per tenant: a hub with deep-linkable tabs for the overview, the tenant's members, its sites, its entitlements and the platform's notes. Support and onboarding questions can then be answered without access to the tenant's operations.

## Requirements

### Requirement: The tenant hub has one route per tab
The tenant hub SHALL have five tabs, each its own route:
- Overview at `/platform/tenants/$tenantId`;
- Members at `.../members`;
- Sites at `.../sites`;
- Entitlements at `.../entitlements`;
- Notes at `.../notes`.

Every tab SHALL show the same header: tenant name, status, package and the suspend or reactivate action. The tab bar SHALL mark the current tab with `aria-current="page"`.

#### Scenario: Deep link to a tab
- **WHEN** the platform admin opens `/platform/tenants/<id>/sites` in a new browser tab
- **THEN** the hub opens with the Sites tab selected and the header of that tenant

#### Scenario: Tab change updates the URL
- **WHEN** the admin selects the tab "Members" on the Overview
- **THEN** the URL becomes `/platform/tenants/<id>/members` and the browser's back button returns to the Overview

#### Scenario: Unknown tenant
- **WHEN** the admin opens `/platform/tenants/<random uuid>/members`
- **THEN** the page shows the platform's "no access" page and no tab content

### Requirement: The Overview shows lifecycle, identity, usage and contacts
The Overview SHALL show:
- the status, and for a suspended tenant the time and reason of the suspension;
- while onboarding, the onboarding progress as steps done of total, naming the open steps; when active, the activation time;
- the four usage meters;
- the tax id with type, value, check status and the time of the last check;
- the flags "Possible duplicate" and "Tax id unverified" when they apply;
- every `tenant_admin` member with name and email, and every open `tenant_admin` invitation;
- the country, the creation time and the last activity.

#### Scenario: Onboarding tenant
- **WHEN** the admin opens the Overview of a tenant that has a site with a hall but no dock
- **THEN** the status reads "Onboarding" and the progress names the dock step as open

#### Scenario: Suspended tenant
- **WHEN** the admin opens the Overview of a tenant suspended with the reason "Unpaid since March"
- **THEN** the status reads "Suspended" with the suspension time and the reason "Unpaid since March"

#### Scenario: Unverified tax id
- **WHEN** the tenant's EU VAT id was checked as invalid by VIES at 10:15 UTC
- **THEN** the Overview shows the id, the type "EU VAT", the label "Unverified" with the check time, and the flag "Tax id unverified"

### Requirement: A possible duplicate links to the matching tenants
When a tenant is flagged as a possible duplicate, the Overview SHALL link to the tenant list, filtered to the tenant itself and every tenant that the duplicate detection of the registration would match against it: the same or an equivalent tax id, or a shared non-free-mail admin email domain. The link SHALL select the list's view "All", so matches show whatever their status. The filter SHALL show as a removable chip and SHALL live in the URL.

#### Scenario: Same tax id
- **WHEN** the admin selects "Show matching tenants" on a flagged tenant with tax id `DE123456789`
- **THEN** the tenant list shows both tenants that use this tax id and no other

#### Scenario: Equivalent tax id in another form
- **WHEN** the flagged tenant has `pl_nip` `5260250274` and another tenant has `eu_vat` `PL5260250274`
- **THEN** the link lists both tenants

#### Scenario: Shared admin domain, different tax ids
- **WHEN** the flagged tenant and another tenant have different tax ids, and both have a tenant admin with an `@acme-logistik.de` email
- **THEN** the link lists both tenants

#### Scenario: Free-mail domain does not match
- **WHEN** the flagged tenant's only admin uses a `gmail.com` address and another tenant's admin does too, with different tax ids
- **THEN** the link lists only the flagged tenant itself

### Requirement: The Overview edits name, country and package
The Overview SHALL show the tenant's name, country and package in one card. An "Edit" action in the card's header SHALL turn only that card into a form with "Cancel" and "Save" inside the card; the other cards stay as they are, and no modal dialog opens. "Cancel" SHALL restore the shown values without a request. "Save" SHALL send the change, close the form on success and confirm it with a toast. The country SHALL be one of the EU-27 country codes a tenant can register with, or empty. An invalid value SHALL answer 422 with the zod path, shown at the field, and the card SHALL stay in edit mode.

#### Scenario: Edit the master data card
- **WHEN** the admin selects "Edit" on the card with name, country and package, changes the name and selects "Save"
- **THEN** the card shows the new name in read mode, a toast confirms the change, and the header shows the new name

#### Scenario: Cancel the edit
- **WHEN** the admin selects "Edit", changes the country and selects "Cancel"
- **THEN** the card shows the previous country in read mode and no request was sent

#### Scenario: Invalid country
- **WHEN** the admin sends `{ "country": "Germany" }` to `PATCH /api/platform/tenants/<id>`
- **THEN** the API answers 422 with an issue at `["country"]` and nothing changes

#### Scenario: Clear the country
- **WHEN** the admin saves the form with an empty country for a tenant without a tax id
- **THEN** the tenant shows "Not set" in the list

#### Scenario: Country that does not fit the tax id
- **WHEN** the admin changes the country of a tenant with the `eu_vat` id `DE123456789` to `AT`, or clears it
- **THEN** the API answers 409 `conflict` with reason `tax_id_country`, the form shows the reason at the country field, and country, tax id and its check status are unchanged

#### Scenario: Country that fits the tax id
- **WHEN** the admin sets the country of a tenant with the `eu_vat` id `DE123456789` from empty to `DE`
- **THEN** the change is saved and the tax id and its check status are unchanged

### Requirement: The Members tab lists members and open invitations
The Members tab SHALL be a data table with one row per member and per open invitation. Columns: name, email, role, state, email verified, last activity, and member since or invited at. States: Member, Disabled, Invited, Invitation expired. It SHALL search name and email, filter by role and state, and sort by name, email, role, last activity and since. All of these run on the server and live in the URL, as for every data table. The tab is read-only. Its rows link nowhere, because the platform does not manage a tenant's members and has no view of them.

#### Scenario: Member and invitation in one table
- **WHEN** a tenant has the dispatcher `daniel@acme.example` and an open invitation for the gate operator `gate@acme.example`
- **THEN** the Members tab lists both: the first with state "Member", the second with state "Invited" and its expiry

#### Scenario: Expired invitation stays visible
- **WHEN** an invitation was neither accepted nor revoked and its expiry has passed
- **THEN** it is listed with state "Invitation expired"

#### Scenario: Revoked and accepted invitations are not listed
- **WHEN** an invitation was revoked, or accepted (the person is now a member)
- **THEN** the Members tab shows no row for that invitation

#### Scenario: Filter by role
- **WHEN** the admin filters role by "Tenant admin"
- **THEN** only tenant admins and open tenant admin invitations are listed

### Requirement: The Sites tab lists the tenant's sites without operational data
The Sites tab SHALL be a data table with one row per site of the tenant. Columns: name, city, country, time zone, active, number of halls, and number of counted docks (active and maintenance). It SHALL search name and city, filter by active, and sort by name, city and created. These run on the server and live in the URL. The tab SHALL NOT show bookings, carriers, visits or any other operational data. Its rows link nowhere: a site's view belongs to the tenant area, which the platform admin cannot open.

#### Scenario: Site with docks
- **WHEN** a tenant has the site "Lager Hamburg" in Hamburg with 2 halls, 8 active docks, 1 dock in maintenance and 1 inactive dock
- **THEN** its row shows "Lager Hamburg", "Hamburg", the country, the time zone, "Active", 2 halls and 9 docks

#### Scenario: Tenant without sites
- **WHEN** an onboarding tenant has no site yet
- **THEN** the Sites tab shows an empty state that says the tenant has not created a site yet

### Requirement: The Entitlements tab holds the package, override and admin invitation tools
The Entitlements tab SHALL show the existing PL-02 content unchanged in behavior:
- the overrides with their expiry, and the form that adds one;
- the entitlements grouped by module with their source;
- the open admin invitations with the re-invite form.

#### Scenario: Override from the Entitlements tab
- **WHEN** the admin adds an override `safety.quiz = on` on `/platform/tenants/<id>/entitlements`
- **THEN** the override is listed there and applies from the tenant's next request, as in PL-02

### Requirement: Hub data is for platform admins only
Every hub API route SHALL require the platform party with `core.manage_tenants`. An id that is not a tenant SHALL answer 404. These routes are the tenant read, the members list, the sites list, the notes routes and the suspension commands.

#### Scenario: Carrier org id
- **WHEN** the admin requests `GET /api/platform/tenants/<carrier org id>/members`
- **THEN** the API answers 404 `not_found`
