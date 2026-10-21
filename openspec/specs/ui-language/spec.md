# ui-language Specification

## Purpose

Makes the UI language a choice of each person, available on every page, signed in or not. It also fixes which language applies to someone who has not chosen one, and what the `i18n.default_locale` setting means.

## Requirements

### Requirement: Every page offers the language menu
Every page of the web app SHALL offer a language menu with de, en and pl, whether the visitor is signed in or not. This covers sign-in, sign-up and its verification, invitation and carrier invitation, carrier registration, magic link, password reset, the public booking link and every signed-in area. Choosing a language SHALL change the page's text at once, without reload, and keep entered form values.

#### Scenario: Signed-out page
- **WHEN** a visitor whose browser prefers German opens `/login` and chooses "English"
- **THEN** the page shows English text, the URL is unchanged and the email field keeps what was typed

#### Scenario: Public booking link
- **WHEN** a carrier opens `/r/<slug>` and chooses "Polski"
- **THEN** the registration form shows Polish text

### Requirement: The visitor's choice wins over defaults
The web app SHALL pick the UI language in this order: the signed-in user's account language, then this device's last explicit choice, then the browser's preferred languages matched against de, en and pl, then the tenant's `i18n.default_locale` inside a tenant area, then `de`. A choice made while signed in SHALL become the account language.

#### Scenario: Device choice before sign-in
- **WHEN** a user without an account language chooses "English" on `/login` and signs in to a tenant whose default is `de`
- **THEN** the tenant area shows English

#### Scenario: Account language on a new device
- **WHEN** a user whose account language is `pl` signs in on a browser that prefers German
- **THEN** the UI shows Polish after sign-in

#### Scenario: Choice while signed in
- **WHEN** a signed-in user chooses "English" in the user menu
- **THEN** `GET /api/me` returns `locale: "en"`

### Requirement: A new account keeps the page language
Accepting an invitation, accepting a carrier invitation, verifying a sign-up and registering through a public booking link SHALL store the page's current language as the new account's language.

#### Scenario: Invitation in another language
- **WHEN** an invited user switches the invitation page to "Polski" and accepts it
- **THEN** the new account's language is `pl`

### Requirement: The default language applies only to people without a choice
`i18n.default_locale` SHALL have the platform and tenant levels only. It SHALL be the language of invitations, emails and exports addressed to a person with no account language, and the last fallback of the UI in a tenant area. Its label and description SHALL say so and SHALL state that everyone can switch the UI language. A site's language stays the site's `default_locale` attribute.

#### Scenario: No site level
- **WHEN** a tenant admin sends a write of `i18n.default_locale` with a `siteId`
- **THEN** the response is 400 `bad_request` with `reason` `scope_not_allowed` and `allowed` `["platform", "tenant"]`

#### Scenario: Existing site rows are ignored
- **WHEN** the database still holds a site-level row of `i18n.default_locale`, written before this change
- **THEN** the effective value for that site comes from the tenant, platform or default, and no settings view lists the row

#### Scenario: Description in the settings
- **WHEN** the tenant admin opens `/t/<org>/settings/general`
- **THEN** the language field explains that it applies to invitations, emails and exports for people who have not chosen a language
