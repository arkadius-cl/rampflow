# Spec Delta

## Purpose

Defines which tax ids a registering company can give, how they are normalized and checked at once by format and check digit, and how EU VAT numbers are confirmed against VIES in the background without ever blocking a registration.

## ADDED Requirements

### Requirement: Tax id is a required pair of type and value
A registration SHALL carry a tax id type and value. The types SHALL be `eu_vat` (EU VAT identification number), `de_stn` (German tax number or business identification number W-IdNr) and `pl_nip` (Polish NIP). The type SHALL fit the country: `de_stn` only with `DE`, `pl_nip` only with `PL`, and an `eu_vat` prefix SHALL match the country (`EL` for `GR`). A type that does not fit the country SHALL answer 422 at `["taxIdType"]`, a prefix of another country 422 at `["taxIdValue"]`.

#### Scenario: Polish NIP for a German company
- **WHEN** a registration carries `country: "DE"` and `taxIdType: "pl_nip"`
- **THEN** the answer is 422 with an issue at `["taxIdType"]`

#### Scenario: VAT prefix of another country
- **WHEN** a registration carries `country: "AT"` and the `eu_vat` value `DE136695976`
- **THEN** the answer is 422 with an issue at `["taxIdValue"]`

### Requirement: Tax ids are normalized before they are checked and stored
The system SHALL remove spaces, dots, hyphens and slashes and upper-case letters before checking and storing a tax id. An `eu_vat` value without its country prefix SHALL get the prefix of the chosen country. The stored and displayed value SHALL be the normalized form.

#### Scenario: VAT number typed with spaces and without prefix
- **WHEN** a German company enters `eu_vat` as `136 695 976`
- **THEN** the tenant stores `DE136695976`

#### Scenario: Greek VAT prefix
- **WHEN** a Greek company enters `eu_vat` without a prefix
- **THEN** the stored value starts with `EL`

### Requirement: Format and check digit are checked at once
The registration form and the API SHALL apply the same rules: an `eu_vat` value SHALL match its member state's format and, where the state defines one, its check digit; a `pl_nip` SHALL be 10 digits with a valid NIP check digit; a `de_stn` SHALL be a 10- or 11-digit state tax number, a 13-digit federal tax number, or a W-IdNr (`DE`, 9 digits, 5 digits) whose 9 digits pass the German VAT check digit. A failure SHALL answer 422 at `["taxIdValue"]` with code `tax_id_format` or `tax_id_checksum`, and the form SHALL show it before sending.

#### Scenario: Wrong NIP check digit
- **WHEN** a Polish company enters the NIP `5260250275`, whose last digit is wrong
- **THEN** the form shows the check-digit message at the tax id field and sends nothing

#### Scenario: Valid W-IdNr
- **WHEN** a German company enters `de_stn` `DE136695976-00001`
- **THEN** the value passes and is stored as `DE13669597600001`

#### Scenario: API rejects what the form would reject
- **WHEN** a client posts an `eu_vat` value with a wrong check digit directly to the API
- **THEN** the answer is 422 at `["taxIdValue"]` with code `tax_id_checksum`

### Requirement: Every tenant tax id has a verification status
A tenant created by registration SHALL store its tax id status: `pending` for `eu_vat`, `unverified` for `de_stn` and `pl_nip`, which have no automatic registry check. A tenant without a tax id (created by a platform admin) SHALL have no status.

#### Scenario: Status after registration
- **WHEN** a German company registers with an `eu_vat` and a Polish company with a `pl_nip`
- **THEN** the German tenant's tax id status is `pending` and the Polish tenant's is `unverified`

### Requirement: EU VAT numbers are confirmed against VIES in the background
A job SHALL check every tenant with an `eu_vat` tax id in status `pending` against the VIES service within 5 minutes of its creation and store the result with the check time: valid → `verified`, invalid → `unverified`, no answer (member state or service unavailable, timeout, rate limit) → `unavailable`. The job SHALL retry `unavailable` numbers at most once per hour until 7 days after the tenant was created; afterwards the status stays `unavailable`.

#### Scenario: Valid number
- **WHEN** the job runs and VIES answers `valid: true` for Acme Süd's number
- **THEN** Acme Süd's tax id status is `verified` and `tax_id_checked_at` is the job's time

#### Scenario: Member state unavailable
- **WHEN** VIES answers with error `MS_UNAVAILABLE`
- **THEN** the status is `unavailable`, and the job asks VIES again on its first run at least one hour later

#### Scenario: Invalid number is flagged, not blocked
- **WHEN** VIES answers `valid: false`
- **THEN** the status is `unverified`, the tenant and its admin keep working, and nothing is sent to the tenant

### Requirement: VIES never blocks a registration
Registration and verification SHALL NOT call VIES and SHALL succeed while VIES is down. When no VIES endpoint is configured, the job SHALL check nothing and leave statuses as they are. The job log SHALL hold counts only.

#### Scenario: VIES down during registration
- **WHEN** VIES does not answer and a company registers and verifies with an `eu_vat`
- **THEN** both steps succeed and the tenant's status is `pending`

#### Scenario: No endpoint in development
- **WHEN** `VIES_URL` is empty and the job runs
- **THEN** no request leaves the API and every `pending` status stays `pending`
