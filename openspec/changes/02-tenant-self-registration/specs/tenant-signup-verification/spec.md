# Spec Delta

## Purpose

Turns a confirmed registration into a working tenant: the emailed link proves the mailbox, one explicit click creates the company, its first tenant admin and its free subscription in one step, and signs that person in.

## ADDED Requirements

### Requirement: The link page asks before it creates
`/signup/verify#<token>` SHALL read the token from the URL fragment, show the email and the company name of the registration, and create nothing until the holder activates "Create company". `POST /api/public/signups/inspect` SHALL return `{ email, companyName, possibleDuplicate }` without using the link, and 401 for an unknown, used, superseded or expired link.

#### Scenario: Opening the link creates nothing
- **WHEN** the person opens the verification link and does not click
- **THEN** the page shows `ops@nordhafen.example` and "Nordhafen Kühllogistik GmbH", and the registration is still `pending_email`

#### Scenario: Inspect does not use the link
- **WHEN** a client calls inspect twice with the same token
- **THEN** both calls answer 200 and the link still verifies afterwards

### Requirement: Verification creates the tenant and its first admin
`POST /api/public/signups/verify` with a valid token SHALL, in one transaction, mark the registration verified and create: a tenant org with the company name, country and tax id; a user with the email (verified), the password, first name, last name, salutation, the page language and the display name "<first> <last>"; a `tenant_admin` membership of that user in that org; and a subscription on package `start`. It SHALL answer `{ tenantId, possibleDuplicate }`.

#### Scenario: Everything exists after the click
- **WHEN** the person clicks "Create company"
- **THEN** an org "Nordhafen Kühllogistik GmbH" of kind `tenant` with status `onboarding` exists, its subscription is `start`, the user `ops@nordhafen.example` has `email_verified_at` set and is its only `tenant_admin`, and the registration is `verified`

#### Scenario: The new admin signs in with the chosen password
- **WHEN** the new admin signs out and signs in at `/login` with the email and the password from the form
- **THEN** sign-in succeeds

### Requirement: Verification signs in and lands on the tenant home
A successful verification SHALL start a session for the new user, replacing any session the browser had, and the page SHALL navigate to `/t/<tenantId>`.

#### Scenario: Landing
- **WHEN** the verification succeeds
- **THEN** the browser is at `/t/<tenantId>` of the new tenant, signed in as the new admin, and the org picker lists only that tenant

### Requirement: The link works once and for 24 hours
A link SHALL verify at most once. A used, superseded or expired link, or one older than 24 hours, SHALL answer 401 `unauthorized` and create nothing. The page SHALL then say that the link is invalid or expired and offer a way back to `/signup`.

#### Scenario: Second click
- **WHEN** the same token is posted to verify a second time
- **THEN** the answer is 401 and exactly one tenant exists for the registration

#### Scenario: Expired link
- **WHEN** the link is used 24 hours and 1 minute after the registration
- **THEN** the answer is 401, no org and no user exist, and the page links to `/signup`

#### Scenario: Concurrent clicks
- **WHEN** two requests verify the same token at the same time on two connections
- **THEN** one answers 200, the other 401, and exactly one tenant org, one user and one membership exist

### Requirement: An account created in the meantime blocks the verification
When an account with the registration's email exists at verification time, the verification SHALL answer 409 `conflict` with reason `account_exists`, create nothing and leave the registration pending. The page SHALL tell the person to sign in instead.

#### Scenario: Invited as staff before clicking
- **WHEN** the person was invited and accepted a staff invitation of another tenant with the same email before clicking the link
- **THEN** the verification answers 409 with reason `account_exists`, no new org exists, and the page links to `/login`

### Requirement: Possible duplicates are hinted and flagged
A registration SHALL count as a possible duplicate when another tenant has an equivalent tax id, or when another tenant has a member whose email domain equals the registration's email domain and that domain is not a free-mail domain. Inspect SHALL return `possibleDuplicate: true`, and the page SHALL show "Your company may already use rampflow. Ask its admin to invite you." above "Create company anyway". Creation SHALL stay allowed and SHALL set the tenant's `possible_duplicate` flag.

#### Scenario: Same VAT number as an existing tenant
- **WHEN** a registration carries the EU VAT number of Acme Logistics and the person clicks "Create company anyway"
- **THEN** the new tenant exists with `possible_duplicate = true`, and the answer carries `possibleDuplicate: true`

#### Scenario: Same company domain
- **WHEN** Acme Logistics has a member `dispatch@acme.example` and a registration uses `ops@acme.example`
- **THEN** inspect returns `possibleDuplicate: true`

#### Scenario: Free-mail domain does not count
- **WHEN** another tenant has a member at `gmail.com` and a registration uses a `gmail.com` address with a new tax id
- **THEN** inspect returns `possibleDuplicate: false` and the new tenant is not flagged

#### Scenario: The hint reveals no other tenant
- **WHEN** the page shows the duplicate hint
- **THEN** neither the page nor the API answer names the other tenant, its admins or its tax id
