# Spec Delta

## Purpose

Defines how closed sets of values (statuses, kinds, roles, reasons, codes, parties, keys) are declared once in a central place and reused everywhere, and how verification rejects string literals that bypass them.

## ADDED Requirements

### Requirement: One central definition per value set

Every closed set of string values SHALL be defined exactly once, as an exported `const` object with `as const` in a `values.ts` file under `packages/shared/src`, together with a type of the same name for its values. A member's key SHALL equal its value when the value is a valid identifier.

#### Scenario: Definition outside a values file

- **WHEN** a developer defines `export const DockKind = { pool: 'pool' } as const` in a route or schema file
- **THEN** `pnpm lint` fails at that object and says that value sets live in a `values.ts` in `packages/shared`

#### Scenario: Key differs from value

- **WHEN** a value set has the member `confirmed: 'Confirmed'`
- **THEN** the shared value-set test fails and names the set and the member

#### Scenario: Duplicate value set

- **WHEN** two value sets in `packages/shared` contain exactly the same values
- **THEN** the shared value-set test fails and names both sets

### Requirement: Use sites reference the value set

Code SHALL refer to a member of a value set through the set (`BookingStatus.no_show`), never through a string literal. This applies to comparisons, `case` labels, arguments, object properties, JSX props, return values, zod schemas, Drizzle columns and checks, router search schemas and tests.

#### Scenario: Literal comparison

- **WHEN** a developer writes `if (b.status === 'no_show')`
- **THEN** `pnpm lint` fails at the comparison and names the fix (`BookingStatus.no_show` from the central set)

#### Scenario: Literal argument

- **WHEN** a developer writes `requirePermission('booking.view')` or `{ channel: 'link' }` where the parameter's type is a value-set type
- **THEN** `pnpm values:check` fails, names the file, line and the value set (`Permission.booking.view`, `DriverChannel.link`)

#### Scenario: Automatic fix

- **WHEN** a developer runs `pnpm values:check --fix`
- **THEN** each flagged literal is replaced by the member of the set its contextual type names, the import is added, and `pnpm values:check` passes

### Requirement: Validation and persistence derive from the value set

The zod schema, the Drizzle column type and the database check constraint of a closed value SHALL all be built from the same value set, so that adding or removing a member changes all of them.

#### Scenario: New member

- **WHEN** a developer adds `on_hold` to `BookingStatus` and regenerates the migration
- **THEN** the API accepts `on_hold` in the zod schemas that use the set, and the migration updates the `booking.status` check to include it

#### Scenario: Unknown value in the database

- **WHEN** a row is inserted with a `booking_event.type`, `booking_acknowledgement.linked_by_party` or `outbox.template` value outside its set
- **THEN** the database rejects it with a check violation

### Requirement: Manifest keys are runtime values

Permission, feature, limit, setting and module keys SHALL be available as runtime objects derived from the module registry (`Permission.booking.view` is `'booking.view'`). Their types SHALL be exactly the manifest keys, so a key removed from a manifest fails type checking at every use.

#### Scenario: Key removed from a manifest

- **WHEN** a developer removes the permission `booking.view` from the booking manifest
- **THEN** `pnpm typecheck` fails at every `Permission.booking.view`

### Requirement: Error codes and conflict reasons are value sets

API error codes and the `reason` of a 409 `conflict` SHALL be value sets shared by the API and the web app. Every conflict reason SHALL have a translation in every staff locale.

#### Scenario: New conflict reason without translation

- **WHEN** a developer adds `ConflictReason.dock_needs_resource` without a `core:errors.conflict.dock_needs_resource` string
- **THEN** the i18n catalog test fails and names the reason and the locale

#### Scenario: Web reads the reason

- **WHEN** the web app handles a 409 with `details.reason`
- **THEN** the reason is typed as `ConflictReason`, and a comparison with a string literal fails lint

### Requirement: No behaviour change from the migration

The migration SHALL NOT change any HTTP request or response, any stored value, any translation or the OpenAPI document's content.

#### Scenario: Unchanged API description

- **WHEN** `pnpm api:docs` runs after the migration
- **THEN** `apps/api/openapi.gen.json` is byte-identical to the version before the migration

#### Scenario: Unchanged behaviour

- **WHEN** the unit, integration and end-to-end suites run after the migration
- **THEN** they pass without changes to their assertions about wire values
