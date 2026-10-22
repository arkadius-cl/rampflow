# tenant-suspension Specification

## Purpose

Lets the platform admin stop a tenant's use of rampflow, for example for abuse, a fake signup or an unpaid account, and restore it later without losing data. The effect on every party (staff, carriers, drivers, public visitors, jobs) is defined precisely.

## Requirements

### Requirement: The platform admin suspends a tenant with a reason
A platform admin with `core.manage_tenants` SHALL suspend a tenant with a reason of 1 to 500 characters. The suspension SHALL take effect with the tenant's next request. It SHALL record the time, and it SHALL write a note of kind "Suspended" with the reason, the author and the time to the tenant's notes. Tenants in onboarding and active tenants can both be suspended.

The web SHALL ask for the reason in a side sheet, opened from the hub header or the list's row actions, not in a modal dialog. The sheet SHALL hold the required reason field, "Cancel" and one primary action "Suspend tenant" in the destructive style. On success the sheet SHALL close, a toast SHALL confirm the suspension, and the status SHALL read "Suspended" in the header and the list. An empty reason SHALL show its error at the field and keep the sheet open.

#### Scenario: Suspend an active tenant
- **WHEN** the platform admin suspends tenant A with the reason "Fake bookings reported by carriers"
- **THEN** the response is 200 with the tenant's status "suspended"
- **AND** tenant A's notes start with a "Suspended" note carrying that reason, the admin's name and the time

#### Scenario: Suspend from the hub
- **WHEN** the platform admin selects "Suspend" in the header of tenant A's hub
- **THEN** a side sheet opens with the reason field, "Cancel" and "Suspend tenant", and the hub stays visible behind it

#### Scenario: Reason missing
- **WHEN** the platform admin sends a suspension with an empty reason
- **THEN** the API answers 422 with an issue at `["reason"]` and the tenant stays as it was

### Requirement: Suspending a suspended tenant changes nothing
Suspending a tenant that is already suspended SHALL answer 200 and leave the suspension time, the notes and the outbox unchanged.

#### Scenario: Double click
- **WHEN** the platform admin suspends tenant A twice in a row
- **THEN** tenant A has one "Suspended" note, keeps the first suspension time, and its admins got one email

### Requirement: The platform admin reactivates a tenant with a reason
A platform admin SHALL reactivate a suspended tenant with a reason of 1 to 500 characters. The tenant SHALL return to "onboarding" if it was never activated, and to "active" otherwise. A note of kind "Reactivated" with the reason, the author and the time SHALL be written. Reactivating a tenant that is not suspended SHALL answer 200 and change nothing. The web SHALL ask for the reason in the same kind of side sheet, with the primary action "Reactivate tenant" in the default style.

#### Scenario: Reactivate an onboarding tenant
- **WHEN** a tenant that had no dock yet was suspended and is reactivated
- **THEN** its status is "onboarding" and its staff can continue the onboarding

#### Scenario: Reactivate an active tenant
- **WHEN** the platform admin reactivates a tenant that is not suspended
- **THEN** the response is 200, and no note or email is written

### Requirement: Suspended tenants refuse their staff
While a tenant is suspended, every request of its staff under `/api/t/:orgId` SHALL answer 403 `tenant_suspended`, including the context request. The staff's sessions and memberships SHALL stay. The web SHALL show a page that says the organisation is suspended and links to the organisation picker, instead of the tenant area. After reactivation the same session SHALL work again.

#### Scenario: Dispatcher opens the plan board
- **WHEN** a dispatcher of suspended tenant A opens `/t/<A>/plan`
- **THEN** the page says that the organisation is suspended and shows no booking

#### Scenario: Request during work
- **WHEN** tenant A is suspended while a gate operator has the gate screen open, and the operator checks in a truck
- **THEN** the check-in answers 403 `tenant_suspended`, the booking is unchanged, and the screen shows the suspended page

#### Scenario: Reactivation restores access
- **WHEN** tenant A is reactivated
- **THEN** the dispatcher's next request with the same session succeeds

#### Scenario: Other memberships unaffected
- **WHEN** a user is a member of suspended tenant A and of active tenant B
- **THEN** the user's requests to tenant B succeed

### Requirement: Carriers cannot act at a suspended tenant
While a tenant is suspended, every carrier request under `/api/c/:orgId/at/:tenantId` for that tenant SHALL answer 403 `tenant_suspended`. This covers availability, book, change, cancel and avis. The carrier's own bookings at that tenant SHALL stay readable in its cross-tenant booking list. The carrier context SHALL mark the tenant as suspended, with the carrier portal off. The booking wizard SHALL not offer it, and the warehouse list SHALL label it "Temporarily unavailable".

#### Scenario: Carrier tries to book
- **WHEN** a carrier user of a carrier linked to suspended tenant A requests availability at A
- **THEN** the API answers 403 `tenant_suspended`

#### Scenario: Carrier still sees its bookings
- **WHEN** the same carrier user opens the booking list across tenants
- **THEN** its bookings at A are listed with their current status

#### Scenario: Warehouse list
- **WHEN** the carrier user opens the warehouse list
- **THEN** tenant A is shown as "Temporarily unavailable" and the booking wizard does not offer A

### Requirement: Driver links of a suspended tenant stop working until reactivation
While a tenant is suspended, every driver request for a booking of that tenant SHALL answer 401 `unauthorized`, as for a revoked link. The driver app SHALL show its existing invalid-link screen. Driver links SHALL NOT be revoked. A link that has not expired SHALL work again after reactivation.

#### Scenario: Driver opens the link
- **WHEN** a driver opens the link of a booking at suspended tenant A
- **THEN** the driver app shows the invalid-link screen

#### Scenario: Link after reactivation
- **WHEN** tenant A is reactivated before the link expires
- **THEN** the same link shows the booking again

### Requirement: Public booking links of a suspended tenant answer not found
While a tenant is suspended, its public booking links and registrations sent through them SHALL answer 404 `not_found`, so a visitor cannot tell the link from an unknown one. The email verification of such a registration SHALL answer 401 `unauthorized`, as for an expired link, and SHALL leave the registration pending. The links SHALL stay unrevoked and work again after reactivation.

#### Scenario: Visitor opens the link
- **WHEN** a visitor opens `/r/<slug>` of suspended tenant A
- **THEN** the page shows that the link is not available, as for an unknown slug

#### Scenario: Verification while suspended
- **WHEN** a carrier registered through tenant A's link before the suspension and clicks the verification link while A is suspended
- **THEN** `POST /api/public/registrations/verify` answers 401, no carrier org, user or link is created, and the registration stays pending

#### Scenario: Verification after reactivation
- **WHEN** tenant A is reactivated before that verification link expires and the carrier clicks it again
- **THEN** the verification succeeds

### Requirement: The platform keeps full access to a suspended tenant
Suspension SHALL NOT restrict the platform party. The platform admin SHALL read the tenant's hub, change its package and overrides, invite admins and add notes while it is suspended.

#### Scenario: Override while suspended
- **WHEN** the platform admin adds an override to suspended tenant A
- **THEN** the response is 200 and the override is listed

### Requirement: Suspension does not change bookings or data
Suspending or reactivating SHALL NOT change any booking, visit, carrier link, member, invitation or setting of the tenant.

#### Scenario: Bookings unchanged
- **WHEN** tenant A with five confirmed bookings is suspended and reactivated
- **THEN** the five bookings are still confirmed with unchanged slots

### Requirement: Business jobs skip suspended tenants; retention does not
The reminder, no-show and holiday import jobs SHALL skip suspended tenants. The retention job SHALL process suspended tenants as any other. The outbox SHALL send emails that were queued before the suspension.

#### Scenario: No reminder while suspended
- **WHEN** a confirmed booking at suspended tenant A is due for its reminder
- **THEN** the reminder job sends no email for it

#### Scenario: No no-show while suspended
- **WHEN** a confirmed booking at suspended tenant A passes its no-show deadline
- **THEN** the no-show job leaves it confirmed

#### Scenario: Retention still runs
- **WHEN** suspended tenant A has driver data past its retention period
- **THEN** the retention job removes it as for an active tenant

### Requirement: Tenant admins are told about suspension and reactivation
On suspension, every `tenant_admin` member of the tenant whose account is not disabled SHALL get one email that names the tenant and the reason. On reactivation they SHALL get one email that names the tenant. Each email SHALL use the member's language, or the platform default language when the member has none. Other roles and no-op commands SHALL get no email.

#### Scenario: Two admins and a dispatcher
- **WHEN** tenant A with two admins and one dispatcher is suspended with the reason "Unpaid since March"
- **THEN** the outbox holds two suspension emails, one per admin, each naming tenant A and "Unpaid since March"
- **AND** none goes to the dispatcher

#### Scenario: Tenant without admin members
- **WHEN** a tenant whose only admin has not accepted the invitation is suspended
- **THEN** no email is queued

### Requirement: The suspension error is a documented code
`tenant_suspended` SHALL be an error code with status 403 and no details. It SHALL be listed in the API reference, and the web SHALL show its translated text. Its message and details SHALL NOT contain the suspension reason.

#### Scenario: Error body
- **WHEN** a staff request of a suspended tenant is refused
- **THEN** the body is `{ "error": { "code": "tenant_suspended", "message": "The organisation is suspended" } }`
