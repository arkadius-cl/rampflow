# Spec Delta

## Purpose

Lets a warehouse operator register its company without a platform admin, through a public form that is protected against abuse, reveals no accounts, and writes nothing but a short-lived pending registration until the email is confirmed.

## ADDED Requirements

### Requirement: Registration form fields
The public page `/signup` SHALL ask for salutation, first name, last name, email, password, company name, country and tax id (type and value). Salutation SHALL be optional, offer "No answer" (preselected), "Mr" and "Ms" (de "Herr", "Frau"; pl "Pan", "Pani"). Every other field SHALL be required. The page SHALL be reachable from `/login`.

#### Scenario: Salutation defaults to no answer
- **WHEN** a visitor opens `/signup`
- **THEN** the salutation field shows "No answer" selected, and the form can be sent without changing it

#### Scenario: Link from sign-in
- **WHEN** a visitor opens `/login`
- **THEN** a link "Register your company" leads to `/signup`

### Requirement: Field rules
First and last name SHALL be 1 to 60 characters after trimming, the company name 1 to 120, the password 10 to 128 characters without composition rules, and the email a valid address of at most 254 characters. The country SHALL be one of the 27 EU member states. A violation SHALL answer 422 `validation_failed` with the zod path of the field, and SHALL write nothing and send nothing.

#### Scenario: Short password
- **WHEN** `POST /api/public/signups` carries a 9-character password
- **THEN** the answer is 422 with an issue at `["password"]`, no `tenant_signup` row exists and no email is enqueued

#### Scenario: Country outside the EU
- **WHEN** the request carries `country: "CH"`
- **THEN** the answer is 422 with an issue at `["country"]`

### Requirement: Proof of work before a registration
A registration SHALL carry a solved proof-of-work challenge issued by `GET /api/public/signups/challenge` within the last 10 minutes. The page SHALL solve it in the browser without cookies and without a third-party service. A missing, wrong, expired or already used solution SHALL answer 422 with an issue at `["altcha"]` and SHALL write nothing and send nothing.

#### Scenario: Solution used twice
- **WHEN** a client sends two registrations with the same solved challenge
- **THEN** the first answers 202 and the second answers 422 at `["altcha"]` and enqueues no email

#### Scenario: Expired challenge
- **WHEN** a client sends a solution to a challenge issued 11 minutes earlier
- **THEN** the answer is 422 at `["altcha"]`

### Requirement: Disposable email addresses are refused
An email whose domain, or a parent domain of it, is on the disposable email domain list SHALL answer 422 with an issue at `["email"]` and code `disposable_email`, and SHALL write nothing and send nothing. The page SHALL show the message at the email field in the page language.

#### Scenario: Disposable domain
- **WHEN** a visitor registers with `ops@mailinator.com`
- **THEN** the answer is 422 at `["email"]` with code `disposable_email` and the email field reads that disposable addresses are not accepted

#### Scenario: Subdomain of a disposable domain
- **WHEN** a visitor registers with `ops@eu.mailinator.com`
- **THEN** the answer is the same 422

### Requirement: One generic answer
A valid registration SHALL answer 202 with an empty body whether or not the email has an account, whether or not a rate limit was reached, and whether or not a pending registration existed. The page SHALL then show "Check your inbox" with the address it sent.

#### Scenario: Known and unknown email answer alike
- **WHEN** one registration uses an email that has an account and another uses a new email
- **THEN** both answer 202 with an empty body

### Requirement: Rate limits answer silently
At most 3 registrations per hour per email (`signup_request`) and 20 per hour per client address (`signup_ip`) SHALL take effect. A registration over either limit SHALL answer the same 202 and SHALL write no row and send no email.

#### Scenario: Fourth registration within the hour
- **WHEN** a visitor sends four valid registrations for `ops@nordhafen.example` within one hour
- **THEN** all four answer 202, and only three verification emails are enqueued

#### Scenario: Many emails from one address
- **WHEN** one client address sends 21 valid registrations for 21 different emails within one hour
- **THEN** the 21st answers 202 and writes no row

### Requirement: A new email gets a pending registration and a verification email
For an email without an account, the system SHALL store one pending registration with the form data, a hash of the password and a hash of a single-use token that expires after 24 hours, and SHALL enqueue the verification email in the page language with the link `/signup/verify#<token>`. It SHALL NOT create an org, a user, a membership or a subscription.

#### Scenario: Only the registration row exists
- **WHEN** a visitor registers "Nordhafen Kühllogistik GmbH" with `ops@nordhafen.example`
- **THEN** one `tenant_signup` row with status `pending_email` exists, no org named "Nordhafen Kühllogistik GmbH" and no `app_user` with that email exist, and Mailpit receives one email to that address with a link to `/signup/verify#...`

#### Scenario: Email in the page language
- **WHEN** the page language is Polish
- **THEN** the verification email is in Polish and greets the person as the person-names capability says

#### Scenario: No token at rest
- **WHEN** the registration is stored
- **THEN** neither the row nor the outbox payload contains the token or the link, only their derivation from the row id

### Requirement: A known email gets a "you already have an account" email
For an email that already has an account, the system SHALL write no registration row and SHALL enqueue an email saying that an account exists, with a link to `/login` and a hint to reset the password there. The email SHALL NOT repeat the form data.

#### Scenario: Carrier user registers a company
- **WHEN** the carrier admin `admin@trans-pol.local` registers a company with that email
- **THEN** the answer is 202, no `tenant_signup` row exists for that email, and Mailpit receives the "you already have an account" email instead of a verification email

### Requirement: A new registration supersedes the pending one
A registration for an email that has a pending registration SHALL mark the earlier one superseded, so that its link stops working, and SHALL store the new one with a new link. At most one pending registration SHALL exist per email.

#### Scenario: Register again after the link expired
- **WHEN** a visitor registers, waits 25 hours and registers again with the same email
- **THEN** the first row has status `superseded`, the second is `pending_email`, and only the second link verifies

#### Scenario: Register again before expiry
- **WHEN** a visitor registers twice within one hour with the same email
- **THEN** the first link answers 401 and the second link works

### Requirement: Pending registrations are deleted after expiry
The retention job SHALL delete every registration row 7 days after its link expired, whatever its status. The stored password hash SHALL leave the row as soon as the link is used. A second run SHALL change nothing.

#### Scenario: Expired registration deleted
- **WHEN** the retention job runs 8 days after a registration's link expired
- **THEN** the row no longer exists and the job log counts it without personal data

#### Scenario: Registration kept until then
- **WHEN** the retention job runs 6 days after the link expired
- **THEN** the row still exists
