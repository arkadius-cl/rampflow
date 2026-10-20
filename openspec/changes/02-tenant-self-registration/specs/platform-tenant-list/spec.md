# Spec Delta

## ADDED Requirements

### Requirement: Tenant list shows and filters the tenant status
The tenant list at `/platform/tenants` SHALL show a Status column with the tenant's status as text ("Onboarding", "Active") next to an icon, and SHALL offer a Status facet with the values Onboarding and Active, each with its count of matching tenants. `GET /api/platform/tenants` SHALL return `status` per tenant and accept the facet as `status`.

#### Scenario: Onboarding tenants only
- **WHEN** the platform admin selects Onboarding in the Status filter
- **THEN** the URL holds `status=onboarding` and the list shows only tenants without an activation time

#### Scenario: Status is readable without color
- **WHEN** the list shows a tenant in onboarding next to an active one
- **THEN** each status cell carries its status as text, so the difference does not depend on color
