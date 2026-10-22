# entitlement-overview Specification

## Purpose

Defines how the platform screens present entitlements, so that a platform admin can compare packages and check a tenant's entitlements module by module instead of in one flat list.

## Requirements

### Requirement: Entitlements are grouped by module
The packages page (`/platform/packages`) and the entitlements card of the tenant hub's Entitlements tab (`/platform/tenants/$tenantId/entitlements`) SHALL group entitlement rows by the module that declares the key, in the module order of the catalog, with the rows of a group in the order the module declares them. Each group SHALL start with a header row that shows the translated module name and the number of rows in the group. Modules without a shown entitlement SHALL have no group.

#### Scenario: Rows sit under their module
- **WHEN** the platform admin opens `/platform/packages` and expands the group "Yard"
- **THEN** the rows `yard.checkin_qr` and `yard.call_to_dock` appear directly under the "Yard" header row
- **AND** no `safety.*` row appears in that group

#### Scenario: Module without entitlements has no group
- **WHEN** the platform admin opens `/platform/packages`
- **THEN** no group header for `driver`, `i18n` or `privacy` appears

#### Scenario: Tenant entitlements live on their tab
- **WHEN** the platform admin opens `/platform/tenants/<id>/entitlements` and expands the group "Yard"
- **THEN** the tenant's `yard.checkin_qr` and `yard.call_to_dock` rows appear under the "Yard" header row with their value, package value and source

### Requirement: Collapsed groups show a feature summary
A collapsed group's header row SHALL show, in every value column, how many of the group's features are on in that column, written as `on/total`. Limits SHALL NOT count. A group with limits only SHALL show an empty summary cell. An expanded group's header SHALL show no summary.

#### Scenario: Summary per package
- **WHEN** the packages page shows the group "Safety" collapsed and the package Starter grants 1 of its 3 shown features
- **THEN** the Starter cell of the "Safety" header reads `1/3`

#### Scenario: Limits-only group
- **WHEN** the group "Core" (only `core.max_*` limits) is collapsed
- **THEN** its value cells in the header are empty

#### Scenario: Summary on the tenant page counts the effective value
- **WHEN** a tenant has an override that turns on `brand.logo` although its package does not grant it, and the group "Brand" is collapsed
- **THEN** the value column of the "Brand" header counts `brand.logo` as on and the package value column does not

### Requirement: Groups expand and collapse
Activating a group header SHALL toggle that group. The header SHALL be a button reachable by keyboard that exposes its state with `aria-expanded` and is at least 44 CSS px high. Collapsed and expanded state SHALL be visible by an icon and not by color alone.

#### Scenario: Toggle one group by keyboard
- **WHEN** the admin focuses the "Yard" header and presses Enter
- **THEN** the yard rows become visible and the header reports `aria-expanded="true"`

### Requirement: Groups start collapsed and toggle together
Without a stored state every group SHALL be collapsed. A button above the table SHALL expand every group when at least one group is collapsed, and collapse every group when all groups are expanded. Its label SHALL name the action it performs.

#### Scenario: First visit
- **WHEN** a user with no stored state opens `/platform/packages`
- **THEN** every group is collapsed and the button reads "Expand all"

#### Scenario: Expand all, then collapse all
- **WHEN** the admin activates "Expand all"
- **THEN** every group is expanded and the button reads "Collapse all"
- **WHEN** the admin activates "Collapse all"
- **THEN** every group is collapsed

### Requirement: Open groups follow the user
The set of open groups SHALL be stored per user and per table as a user UI preference, and SHALL be restored when the same user opens the table again, in any browser. The packages page and the tenant page SHALL keep separate sets; the tenant page SHALL use one set for all tenants.

#### Scenario: State survives a new browser
- **WHEN** the admin expands "Yard" on `/platform/packages`, then signs in on another browser and opens the page
- **THEN** only "Yard" is expanded

#### Scenario: Pages keep their own state
- **WHEN** the admin expanded "Yard" on the packages page and nothing on the tenant page
- **THEN** every group on a tenant page is collapsed

### Requirement: Both screens present groups the same way
The packages page and the tenant entitlements card SHALL use the same group header, toggle, summary and toggle-all button, differing only in their value columns.

#### Scenario: Same header on both pages
- **WHEN** the admin compares the "Yard" header on `/platform/packages` and on a tenant page
- **THEN** both show the module name, the row count, the expand icon and the summary in the same layout
