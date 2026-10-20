# Spec Delta

## Purpose

Defines the status of a tenant across its life, derived from stored facts rather than set by hand, so that onboarding, platform views and later billing read one answer to "is this tenant set up yet".

## ADDED Requirements

### Requirement: Tenant status is derived from the activation time
A tenant's status SHALL be `onboarding` while it has no activation time and `active` once it has one. The status SHALL NOT be stored as its own value. A registration that is still waiting for its email confirmation SHALL NOT be a tenant and SHALL have no tenant status.

#### Scenario: Status of a fresh tenant
- **WHEN** a tenant has no activation time
- **THEN** its status is `onboarding`

#### Scenario: Status after activation
- **WHEN** a tenant's activation time is set
- **THEN** its status is `active`

#### Scenario: Pending registration
- **WHEN** a company registered but has not confirmed its email
- **THEN** no tenant org exists for it

### Requirement: New tenants start in onboarding
A tenant created by self-registration and a tenant created by a platform admin (PL-01) SHALL both start without an activation time, so both start in `onboarding`.

#### Scenario: Admin-created tenant
- **WHEN** the platform admin creates the tenant "Elbe Cold Store" with package Pro
- **THEN** its status is `onboarding` and the tenant list shows it as "Onboarding"

#### Scenario: Self-registered tenant
- **WHEN** a registration is verified
- **THEN** the new tenant's status is `onboarding`

### Requirement: Tenants that existed before stay active
Every tenant that existed before this capability SHALL be active, with its creation time as activation time.

#### Scenario: Backfill
- **WHEN** the migration runs on a database with Acme Logistics, created on 2026-10-19
- **THEN** Acme Logistics has status `active` and activation time equal to its creation time

### Requirement: Tenant-only facts exist only on tenants
Activation time, tax id, tax id status and the duplicate flag SHALL be stored only for orgs of kind `tenant`. The database SHALL refuse them on platform and carrier orgs.

#### Scenario: Carrier org with a tax id
- **WHEN** any writer tries to store a tax id or an activation time on a carrier org
- **THEN** the database refuses the write with a check violation
