# Spec Delta

## MODIFIED Requirements

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
