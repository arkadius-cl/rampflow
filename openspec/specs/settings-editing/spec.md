# settings-editing Specification

## Purpose

Defines how an admin changes settings on a topic page: one form per topic, saved in one atomic request. Each field always shows where its value comes from. Shortening a retention period needs confirmation, and the admitted countries are edited in a list the admin can scan.

## Requirements

### Requirement: Several settings are written in one atomic request
`PATCH /api/platform/settings` and `PATCH /api/t/:orgId/settings` SHALL accept `{ set: { <key>: <value> }, reset: [<key>] }`; the tenant route also takes `siteId` (uuid or null). They SHALL validate every entry like the per-key write and store all or none. On success they SHALL answer 200 with the level's settings view. A key SHALL NOT appear in both `set` and `reset`, and the request SHALL hold at least one entry.

#### Scenario: Two keys saved together
- **WHEN** the tenant admin sends `{ "siteId": null, "set": { "booking.horizon_days": 45, "booking.min_lead_minutes": 60 }, "reset": [] }`
- **THEN** the response is 200, both fields show source `tenant` with the new values, and two rows are stored

#### Scenario: One invalid value stores nothing
- **WHEN** the request sets `booking.horizon_days` to 45 and `booking.min_lead_minutes` to -1
- **THEN** the response is 422 with an issue at the path `["set", "booking.min_lead_minutes"]`, and `booking.horizon_days` keeps its old value

#### Scenario: Set and reset in one request
- **WHEN** the request sets `yard.grace_minutes` to 20 and resets `yard.early_tolerance_minutes`, which had a tenant override
- **THEN** the response is 200, `yard.grace_minutes` shows source `tenant` and `yard.early_tolerance_minutes` shows its inherited value and source

#### Scenario: Errors as for the per-key write
- **WHEN** the request names an unknown key, a key without the target's level, or a key whose entitlement is off
- **THEN** the response is 400 `bad_request` (with `reason` `unknown_key` or `scope_not_allowed`) or 403 `entitlement_required` with the blocking key, and nothing is stored

#### Scenario: Key in set and reset
- **WHEN** the request sets and resets `booking.horizon_days`
- **THEN** the response is 422 and nothing is stored

#### Scenario: Other tenant's site
- **WHEN** the tenant admin sends a `siteId` of another tenant
- **THEN** the response is 404 and nothing is stored

### Requirement: A topic page is one form with one save bar
A topic page SHALL edit its fields as one form. A save bar SHALL show "Save" and "Discard". Both SHALL be disabled until a field differs from its loaded value, and the bar SHALL say whether there are unsaved changes. Saving SHALL send only the keys the user changed or asked to inherit, in one request. A failed save SHALL keep every edit and show each field's error at that field.

#### Scenario: Only changed keys are written
- **WHEN** the tenant admin changes "Booking horizon" from the inherited 30 to 45 and saves, leaving the other booking fields as loaded
- **THEN** the request's `set` holds only `booking.horizon_days`, and every other field keeps its inherited source

#### Scenario: Discard
- **WHEN** the admin changes two fields and presses "Discard"
- **THEN** both fields show their loaded values and nothing is sent

#### Scenario: Validation error keeps the edits
- **WHEN** the admin enters 0 in "Booking horizon" and 60 in "Minimum lead time" and saves
- **THEN** "Booking horizon" shows its error, "Minimum lead time" still shows 60, and nothing is stored

#### Scenario: A refetch does not overwrite edits
- **WHEN** the settings data is refetched in the background while the form has unsaved changes
- **THEN** the edited fields keep the user's values

### Requirement: Inheriting a value is a pending change
A field whose value is set on the page's level SHALL offer "Use inherited value", naming the value it would inherit. Choosing it SHALL mark the field as pending and show the inherited value and source. The override SHALL be removed only when the form is saved. "Discard" SHALL undo it.

#### Scenario: Inherit, then save
- **WHEN** the tenant admin chooses "Use inherited value (30)" on "Booking horizon" with a tenant value of 45, then saves
- **THEN** the request's `reset` holds `booking.horizon_days`, and the field shows 30 from its source above

#### Scenario: Inherit, then discard
- **WHEN** the admin chooses "Use inherited value" and then "Discard"
- **THEN** the field shows 45 set on this level and nothing is sent

### Requirement: Leaving with unsaved changes asks first
With unsaved changes, any navigation out of the topic page SHALL ask whether to leave and lose the changes. This includes another topic, another site or organization, an origin link, a search result on another topic, the browser's back button and closing the tab. Staying SHALL keep every edit. Moving to an anchor on the same page SHALL NOT ask.

#### Scenario: Topic change with unsaved edits
- **WHEN** the admin changes "Booking horizon" and selects the topic "Yard"
- **THEN** a dialog asks to leave or stay, and "Stay" keeps the page and the edit

#### Scenario: Same-page anchor
- **WHEN** the admin with unsaved edits chooses a search result on the current topic
- **THEN** the page moves to that field without asking

### Requirement: Every field shows the origin of its value
Each field SHALL show, as text, where its effective value comes from, relative to the page's level. Possible texts: "Product default", "From platform", "From tenant", "Set for the platform", "Set for this tenant" or "Set for this site". A value set on the page's level SHALL also show the value it would inherit. Whether a value is set on this level SHALL follow from its source, not from comparing values.

#### Scenario: Tenant value equal to the platform value
- **WHEN** the platform sets "Booking horizon" to 30 and the tenant stores 30 as well
- **THEN** the tenant page shows "Set for this tenant" with "Inherited: 30 (From platform)", and "Use inherited value" is offered

#### Scenario: Platform page without a stored value
- **WHEN** the platform admin views a field with no platform row
- **THEN** it shows "Product default"

#### Scenario: Site page with a tenant value
- **WHEN** the site has no row for "Booking horizon" and the tenant has 45
- **THEN** the site page shows 45 with "From tenant"

### Requirement: The field states on which levels it can be set
A field SHALL state its levels when they differ from "platform, tenant and site". A platform-only setting SHALL say "Platform only: tenants cannot change this". A setting without a site level SHALL say "Applies to all sites of the tenant" on the tenant page.

#### Scenario: Platform-only retention
- **WHEN** the platform admin views `privacy.retention.carrier_inactive_days`
- **THEN** the field says that tenants cannot change it

#### Scenario: Tenant-wide setting
- **WHEN** the tenant admin views `safety.quiz_pass_percent`
- **THEN** the field says it applies to all sites of the tenant

### Requirement: Shortening a retention period needs confirmation
When a save would lower the effective value of a setting in the Retention section (the `privacy.retention.*` keys except `privacy.retention.driver_link_hours`, which limits link validity and deletes no data) on the page's level, the save SHALL first open a confirmation dialog. This includes inheriting a lower value. The dialog SHALL list each such setting with its old and new value and state that data older than the new period is deleted or pseudonymized on the next retention run. Cancelling SHALL keep the edits unsaved. Raising a value, or other settings, SHALL NOT ask.

#### Scenario: Shorter visit retention
- **WHEN** the tenant admin lowers "Keep visits" from 395 to 180 days and saves
- **THEN** a dialog shows "Keep visits: 395 → 180 days" and the consequence, and nothing is sent until the admin confirms

#### Scenario: Inheriting a shorter value
- **WHEN** the tenant has "Keep visits" at 395, the platform has 365, and the admin chooses "Use inherited value" and saves
- **THEN** the dialog shows "395 → 365 days"

#### Scenario: Longer retention
- **WHEN** the admin raises "Keep visits" from 395 to 730 days and saves
- **THEN** the save runs without a dialog

### Requirement: Units sit next to the value
A numeric setting measured in minutes, hours, days or percent SHALL show its unit as a suffix of the input, and its label SHALL NOT repeat the unit. The suffix SHALL be part of the input's accessible description.

#### Scenario: Minutes suffix
- **WHEN** the admin views "Minimum lead time"
- **THEN** the input shows "min" after the value and the label reads "Minimum lead time" without "(minutes)"

### Requirement: Admitted countries are chosen from a grouped list
The platform field `core.site_countries` SHALL show every admissible country as a checkbox, sorted by name in the UI language. Countries SHALL be grouped as "EU member states" and "Other countries", and each group SHALL have a select-all checkbox. The field SHALL show "N of M selected". The stored value SHALL stay the list of country codes.

#### Scenario: Default selection
- **WHEN** the platform admin opens the general topic with no stored value
- **THEN** all 27 EU countries are checked, the EU group checkbox is checked, the other group checkbox is unchecked, and the field says "27 of 57 selected"

#### Scenario: Partial group
- **WHEN** the admin unchecks Malta
- **THEN** the EU group checkbox shows a mixed state (`aria-checked="mixed"`) that is visibly distinct from checked, and the count reads "26 of 57 selected"

#### Scenario: Select a whole group
- **WHEN** the admin checks the "Other countries" group checkbox
- **THEN** every country of that group is checked and the count reads "57 of 57 selected"

### Requirement: The country filter narrows the list without hidden changes
A filter field SHALL show only the countries whose name or code matches, ignoring case and accents. While a filter is active, the group checkboxes SHALL be hidden, so no action changes a country the admin cannot see. The total count SHALL still count every selected country.

#### Scenario: Filter by name
- **WHEN** the admin types "slo"
- **THEN** only Slovakia and Slovenia are listed, no group checkbox is shown, and the count still reads the total

#### Scenario: Filter by code
- **WHEN** the admin types "TR"
- **THEN** Turkey is listed

### Requirement: At least one country stays admitted
The admin SHALL NOT be able to save an empty list of admitted countries. Unchecking the last country SHALL show the error "Select at least one country" at the field and SHALL NOT be saved.

#### Scenario: Last country
- **WHEN** the admin unchecks every country and saves
- **THEN** the field shows the error and nothing is sent
