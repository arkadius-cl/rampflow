# Spec Delta

## MODIFIED Requirements

### Requirement: Tenant status is derived from the activation time
A tenant's status SHALL be `suspended` while it has a suspension time. Otherwise it SHALL be `onboarding` while it has no activation time and `active` once it has one. The status SHALL NOT be stored as its own value. A registration that is still waiting for its email confirmation SHALL NOT be a tenant and SHALL have no tenant status.

#### Scenario: Status of a fresh tenant
- **WHEN** a tenant has no activation time and no suspension time
- **THEN** its status is `onboarding`

#### Scenario: Status after activation
- **WHEN** a tenant's activation time is set and it has no suspension time
- **THEN** its status is `active`

#### Scenario: Suspension wins over onboarding and activation
- **WHEN** a tenant has a suspension time, with or without an activation time
- **THEN** its status is `suspended`

#### Scenario: Reactivation restores the derived status
- **WHEN** the suspension time of a tenant without an activation time is cleared
- **THEN** its status is `onboarding` again

#### Scenario: Pending registration
- **WHEN** a company registered but has not confirmed its email
- **THEN** no tenant org exists for it

## ADDED Requirements

### Requirement: Only tenants can be suspended
The suspension time SHALL be stored only for orgs of kind `tenant`. The database SHALL refuse it on platform and carrier orgs.

#### Scenario: Carrier org with a suspension time
- **WHEN** any writer tries to set a suspension time on a carrier org
- **THEN** the database refuses the write with a check violation
