# Spec Delta

## Purpose

Guides a new tenant from an empty company to its first bookable dock. The tenant becomes active automatically at that moment, and every action that needs a working dock stays blocked until then.

## ADDED Requirements

### Requirement: Tenant status is visible to tenant staff
`GET /api/t/:orgId/context` SHALL return `status`: `onboarding` while the tenant has never been activated, and `active` afterwards. The web app SHALL read the tenant status only from this field.

#### Scenario: New tenant
- **WHEN** the admin of a tenant without any dock calls `GET /api/t/:orgId/context`
- **THEN** the response has `status: "onboarding"`

#### Scenario: Tenant with a dock
- **WHEN** a member of a tenant whose first dock was created calls `GET /api/t/:orgId/context`
- **THEN** the response has `status: "active"`

### Requirement: Onboarding steps
`GET /api/t/:orgId/onboarding` SHALL return the tenant `status`, `activatedAt`, and three steps in this order: `site`, `hall`, `dock`. Each step SHALL have `done` and the `siteId` its link opens. `site` is done when the tenant has an active site, `hall` when an active site has a hall, `dock` when the tenant has a dock. The route SHALL require `core.manage_sites`.

#### Scenario: Site created, no hall yet
- **WHEN** the tenant has the active site "Bremerhaven" without halls and the admin calls `GET /api/t/:orgId/onboarding`
- **THEN** `status` is `onboarding`, `activatedAt` is `null`, `site` is done with the id of "Bremerhaven", and `hall` and `dock` are not done

#### Scenario: Dispatcher without the permission
- **WHEN** a dispatcher of the tenant calls `GET /api/t/:orgId/onboarding`
- **THEN** the response is 403 `forbidden`

### Requirement: Onboarding checklist screen
`/t/$orgId/onboarding` SHALL show the three steps with their state as text and icon, not by color alone. Each open step SHALL link to the existing master data screen: "Create a site" to `/t/$orgId/sites?new=1`, "Add a hall" and "Add a dock" to the site page of the step's `siteId`. The checklist SHALL NOT contain master data forms of its own. When the site step is done, it SHALL show the site's weekly hours with a link to its hours tab.

#### Scenario: Open steps link to the master data screens
- **WHEN** the admin of a tenant without sites opens `/t/$orgId/onboarding`
- **THEN** the step "Create a site" is marked open and links to `/t/$orgId/sites?new=1`, which opens the "New site" form

#### Scenario: Progress after the site
- **WHEN** the tenant has the site "Bremerhaven" and no hall
- **THEN** the step "Create a site" is marked done and shows the site's hours, and "Add a hall" links to `/t/$orgId/sites/<id of Bremerhaven>`

#### Scenario: Completed checklist
- **WHEN** the admin opens `/t/$orgId/onboarding` after the first dock was created
- **THEN** every step is marked done, the page says the company is active since the activation time in the user's locale, and it links to inviting carriers, the public booking link and staff

### Requirement: Tenant home leads to the checklist during onboarding
While the tenant is in onboarding, opening `/t/$orgId` SHALL redirect a member with `core.manage_sites` to `/t/$orgId/onboarding`. Members without that permission, and every member of an active tenant, SHALL get the tenant home as before.

#### Scenario: Admin signs in to a new tenant
- **WHEN** the tenant admin of a tenant in onboarding opens `/t/$orgId`
- **THEN** the browser shows `/t/$orgId/onboarding`

#### Scenario: Active tenant
- **WHEN** the tenant admin of an active tenant opens `/t/$orgId`
- **THEN** the browser shows the first screen of the navigation, as before

### Requirement: Onboarding notice on office screens
While the tenant is in onboarding, every tenant office screen SHALL show a notice that carriers and bookings open once the first dock exists. For members with `core.manage_sites` the notice SHALL link to `/t/$orgId/onboarding`. The notice SHALL disappear without a reload once the tenant is active.

#### Scenario: Notice disappears on activation
- **WHEN** the admin creates the first dock in the dock dialog
- **THEN** the onboarding notice is gone from the site page without a page reload

### Requirement: The first dock activates the tenant
The transaction that creates a tenant's first dock SHALL set the tenant's activation time to the current time of the injected clock. A tenant with a site and a hall but no dock SHALL stay in onboarding. When the dock creation fails, the tenant SHALL stay in onboarding.

#### Scenario: First dock
- **WHEN** the admin creates dock "T01" in hall "Halle 1" of the tenant's only site
- **THEN** the dock exists, the tenant's `activatedAt` equals the clock time of that request, and the context answers `status: "active"`

#### Scenario: Failed dock creation
- **WHEN** the first dock creation of a tenant fails with 409 `limit_reached`
- **THEN** no dock exists and the tenant is still in onboarding

#### Scenario: Hall without dock
- **WHEN** the tenant has a site and a hall and no dock
- **THEN** the tenant is in onboarding

### Requirement: Activation is one-way
Once set, the activation time SHALL never change and the tenant SHALL never return to onboarding. Creating more docks, setting every dock to `inactive` or `maintenance`, or deactivating every site SHALL leave the tenant active with its first activation time. Only the tenant's own scope SHALL be able to set the activation time, and only while it is unset.

#### Scenario: All docks inactive
- **WHEN** an active tenant sets every dock to `inactive`
- **THEN** `status` stays `active` and `activatedAt` is unchanged

#### Scenario: Second dock
- **WHEN** an active tenant creates another dock a day later
- **THEN** `activatedAt` keeps the time of the first dock

#### Scenario: Database refuses a second activation write
- **WHEN** a statement in the tenant's scope tries to change the activation time of an active tenant
- **THEN** no row changes

### Requirement: Carrier-facing and booking actions are blocked during onboarding
While the tenant is in onboarding, these routes SHALL answer 409 `onboarding_incomplete` and write nothing: `POST /api/t/:orgId/carriers/invitations`, `POST /api/t/:orgId/carriers/public-links`, `POST /api/t/:orgId/carriers/public-links/:siteId/regenerate`, `POST /api/t/:orgId/bookings`, `POST /api/t/:orgId/yard/walk-ins` and `POST /api/c/:orgId/at/:tenantId/bookings`. A missing permission or entitlement SHALL still answer 403 first.

#### Scenario: Carrier invitation during onboarding
- **WHEN** the admin of a tenant in onboarding sends `POST /api/t/:orgId/carriers/invitations` with a valid body
- **THEN** the response is 409 with `error.code` `onboarding_incomplete`, no `carrier_invitation` row exists, and Mailpit has no email to the address

#### Scenario: Staff booking during onboarding
- **WHEN** a dispatcher of a tenant in onboarding sends `POST /api/t/:orgId/bookings`
- **THEN** the response is 409 `onboarding_incomplete` and no booking exists

#### Scenario: Missing permission wins
- **WHEN** a gate operator of a tenant in onboarding sends `POST /api/t/:orgId/carriers/invitations`
- **THEN** the response is 403 `forbidden`

#### Scenario: Same route after activation
- **WHEN** the tenant created its first dock and the admin sends the same carrier invitation
- **THEN** the response is 201 and the invitation email is sent

### Requirement: Setup actions stay open during onboarding
While the tenant is in onboarding, sites, halls, docks, bookable resources, opening hours, closures, load types, settings, the logo and staff invitations SHALL work as for an active tenant.

#### Scenario: Staff invitation during onboarding
- **WHEN** the admin of a tenant in onboarding invites `lager@nordhafen.local` as dispatcher
- **THEN** the response is 201 and the invitation email is sent

### Requirement: Blocked actions are disabled with an explanation
While the tenant is in onboarding, the web app SHALL disable "Invite carrier", "Create link" on the public links tab, "New booking" and "Walk-in now" on the plan board, and "Walk-in" at the gate. Next to each, it SHALL show in text that the action opens once the first dock exists, with a link to the checklist for members with `core.manage_sites`. A 409 `onboarding_incomplete` from any route SHALL show the translated `core:errors.onboarding_incomplete` text.

#### Scenario: Carriers page during onboarding
- **WHEN** the admin of a tenant in onboarding opens `/t/$orgId/carriers`
- **THEN** "Invite carrier" is disabled, the text next to it explains that carriers can be invited once the first dock exists, and it links to `/t/$orgId/onboarding`

#### Scenario: Unlocked after activation
- **WHEN** the admin creates the first dock and then opens `/t/$orgId/carriers`
- **THEN** "Invite carrier" is enabled and no explanation is shown

### Requirement: Gated operations are marked in the API description
Every operation blocked during onboarding SHALL carry `x-requires-active-tenant: true` in `apps/api/openapi.gen.json` and list 409 with the error envelope. The route tables in `docs/reference/api-routes.md` SHALL show "active tenant" in the entitlement column of these routes. Every such route's route case SHALL declare the onboarding check, and the harness SHALL run it.

#### Scenario: Gated operation in the document
- **WHEN** `pnpm api:docs` runs
- **THEN** the operation of `POST /api/t/:orgId/carriers/invitations` has `x-requires-active-tenant: true`

#### Scenario: Route case without the onboarding check
- **WHEN** a route uses the onboarding guard and its route case does not declare the onboarding check
- **THEN** `route-coverage.test.ts` fails and names the route
