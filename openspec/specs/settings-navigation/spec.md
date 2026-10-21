# settings-navigation Specification

## Purpose

Gives every setting one place that users can find and link to: settings are grouped into topics and sections, each topic is a route on each level (platform, tenant, site), and each setting has an anchor, a search entry and a link to the level its value comes from.

## Requirements

### Requirement: Every setting belongs to one topic and one section
Each setting key SHALL be placed in exactly one topic and one section of that topic, as listed below. The topics, in this order, are `general`, `booking`, `avis`, `safety`, `yard` and `privacy`. Sections appear in the listed order, and settings appear in their listed order within a section. A new setting key SHALL NOT build without a placement.

| Topic | Section | Keys |
|---|---|---|
| general | sites | `core.site_countries` |
| general | language | `i18n.default_locale` |
| booking | rules | `booking.slot_grid_minutes`, `booking.min_lead_minutes`, `booking.horizon_days`, `booking.cancel_cutoff_minutes`, `booking.close_on_public_holidays`, `booking.require_plate` |
| booking | public_booking | `booking.public_link_enabled`, `booking.public_registration_mode` |
| booking | reminders | `notify.reminder_hours_before` |
| avis | requirements | `avis.required_reference_types`, `avis.unique_references`, `avis.require_gross_weight`, `avis.require_driver_phone` |
| safety | briefing | `safety.validity_days`, `safety.require_for_checkin`, `safety.quiz_pass_percent` |
| yard | arrival | `yard.early_tolerance_minutes`, `yard.grace_minutes`, `yard.no_show_after_minutes` |
| yard | dwell | `yard.standgeld_flag_minutes` |
| privacy | notice | `privacy.notice_url` |
| privacy | retention | `privacy.retention.driver_phone_days`, `privacy.retention.driver_identity_days`, `privacy.retention.visit_days`, `privacy.retention.safety_after_expiry_days`, `privacy.retention.audit_log_days`, `privacy.retention.carrier_inactive_days` |
| privacy | driver_access | `privacy.retention.driver_link_hours` |

#### Scenario: Reminder lead time sits under booking
- **WHEN** the tenant admin opens `/t/<org>/settings/booking`
- **THEN** the section "Reminders" shows the field `notify.reminder_hours_before`, and no other topic shows it

#### Scenario: Driver link validity has its own section
- **WHEN** the platform admin opens `/platform/settings/privacy`
- **THEN** the sections read "Privacy notice", "Retention" and "Driver access" in this order, and `privacy.retention.driver_link_hours` is the only field under "Driver access"

### Requirement: Each topic is a route on each level
The settings of a level SHALL be reached at `/platform/settings/$topic` (platform), `/t/$orgId/settings/$topic` (tenant) and `/t/$orgId/sites/$siteId/settings/$topic` (site). A topic page SHALL show only the settings of that topic that the level may hold and whose entitlement is on. The page title SHALL name the topic, and the breadcrumb SHALL name the level and the topic, for example "Platform › Settings › Booking" or "Sites › Hamburg › Settings › Booking".

#### Scenario: Deep link to a topic
- **WHEN** a tenant admin opens `/t/<org>/settings/yard` in a new browser tab
- **THEN** the page shows the yard settings of the tenant level, with "Yard" marked as the current topic

#### Scenario: Topic change updates the URL
- **WHEN** the admin selects the topic "Privacy" on `/platform/settings/booking`
- **THEN** the URL becomes `/platform/settings/privacy` and the browser's back button returns to the booking topic

### Requirement: The topic navigation lists only topics with settings
The topic navigation of a level SHALL list, in topic order, every topic that holds at least one setting available on that level, and no other. Each entry SHALL be a real link marked with `aria-current="page"` when it is the current topic. A section with no available setting SHALL NOT be shown.

#### Scenario: Site level has no general topic
- **WHEN** the tenant admin opens the settings of a site
- **THEN** the navigation lists Booking, Avis, Safety, Yard and Privacy, and not General, because neither `core.site_countries` nor `i18n.default_locale` has a site level

#### Scenario: Entitlement off hides a section
- **WHEN** the tenant's `notify.reminders` feature is off
- **THEN** the booking topic has no "Reminders" section and the search finds no reminder setting

### Requirement: The settings root opens the first available topic
Opening `/platform/settings`, `/t/$orgId/settings` or `/t/$orgId/sites/$siteId/settings` SHALL replace the URL with the first topic the navigation of that level lists.

#### Scenario: Platform settings root
- **WHEN** the platform admin opens `/platform/settings`
- **THEN** the URL becomes `/platform/settings/general` and the back button does not return to `/platform/settings`

#### Scenario: Site settings root
- **WHEN** the tenant admin opens `/t/<org>/sites/<site>/settings`
- **THEN** the URL becomes `/t/<org>/sites/<site>/settings/booking`

### Requirement: Unknown or unavailable topics show no access
Opening a topic that does not exist, or that holds no available setting on that level, SHALL show the area's "no access" page inside the shell. It SHALL NOT redirect to another topic.

#### Scenario: Unknown topic
- **WHEN** the admin opens `/t/<org>/settings/billing`
- **THEN** the page shows "no access" and no settings form

#### Scenario: Topic without settings on this level
- **WHEN** the admin opens `/t/<org>/sites/<site>/settings/general`
- **THEN** the page shows "no access"

### Requirement: Site settings live in the site view
A site's settings SHALL be the "Settings" tab of the site view, a child route of `/t/$orgId/sites/$siteId` after the existing tabs. The tenant settings page SHALL NOT offer site tabs. Its header SHALL link to the site list, so an admin can find the per-site settings.

#### Scenario: Settings tab in the site view
- **WHEN** a tenant admin with `core.manage_settings` opens the site "Hamburg"
- **THEN** the site tabs end with "Settings", which links to `/t/<org>/sites/<hamburg>/settings`

#### Scenario: Admin without settings permission
- **WHEN** a user with `core.manage_sites` but without `core.manage_settings` opens a site
- **THEN** the site tabs do not show "Settings"

### Requirement: Old settings URLs redirect to the new routes
`/t/$orgId/settings?site=<id>` SHALL replace the URL with `/t/$orgId/sites/<id>/settings` when the user may see that site. For a site that does not exist or belongs to another tenant, it SHALL show "no access" and SHALL NOT show the tenant level.

#### Scenario: Bookmark of a site tab
- **WHEN** the admin opens `/t/<org>/settings?site=<hamburg>`
- **THEN** the URL becomes `/t/<org>/sites/<hamburg>/settings/booking`

#### Scenario: Foreign site id
- **WHEN** the admin opens `/t/<org>/settings?site=<site of another tenant>`
- **THEN** the page shows "no access" and no tenant settings form

### Requirement: Each setting has a deep link
Every field SHALL be addressable as `<topic URL>#<setting key>`, for example `/platform/settings/privacy#privacy.retention.visit_days`. Opening such a URL, or changing the hash to it, SHALL scroll the field into view below any sticky header, highlight it, and move keyboard focus to the field's title, so the next Tab reaches its control.

#### Scenario: Open a setting by link
- **WHEN** the platform admin opens `/platform/settings/privacy#privacy.retention.visit_days`
- **THEN** the field "Keep visits" is in view, highlighted and its title has focus, and pressing Tab focuses its input

#### Scenario: Unknown anchor
- **WHEN** the admin opens `/platform/settings/booking#nope`
- **THEN** the booking topic opens at its top and nothing is highlighted

### Requirement: A field offers to copy its link
Each field SHALL offer a "Copy link" button with an accessible name that names the setting. It SHALL copy the field's absolute deep link and announce "Link copied" in a polite live region. The field SHALL NOT show its technical key as visible text.

#### Scenario: Copy a link
- **WHEN** the admin presses "Copy link" on "Booking horizon"
- **THEN** the clipboard holds `<origin>/t/<org>/settings/booking#booking.horizon_days` and a status message says the link was copied

### Requirement: Settings search finds a setting on the current level
The settings pages SHALL offer a visible "Search settings" button that opens a search dialog. The search SHALL match, ignoring case and accents, the label, the description and the key of every setting available on the current level. Each result SHALL show the label and its topic and section. Choosing a result SHALL open its deep link.

#### Scenario: Find by a word of the description
- **WHEN** the tenant admin searches "storno" on any tenant topic page
- **THEN** the result "Change and cancellation cutoff" under "Booking › Rules" is listed, and choosing it opens `/t/<org>/settings/booking#booking.cancel_cutoff_minutes` with that field focused

#### Scenario: Search stays on the level
- **WHEN** the tenant admin searches "Länder" on the tenant settings
- **THEN** no result is listed, because `core.site_countries` has no tenant level

#### Scenario: Find by key
- **WHEN** the platform admin searches `driver_link_hours`
- **THEN** the result "Driver link validity" under "Privacy › Driver access" is listed

### Requirement: An inherited value links to its source level
When a field's value comes from a level above the page's level, and the user may manage settings on that level, the origin text SHALL link to the same field on the source level. When the source is the product default, or the user may not manage the source level, the origin SHALL be plain text.

#### Scenario: Site value from the tenant
- **WHEN** the tenant admin views `booking.horizon_days` on a site whose value comes from the tenant
- **THEN** the origin "From tenant" links to `/t/<org>/settings/booking#booking.horizon_days`

#### Scenario: Tenant admin sees a platform value
- **WHEN** the tenant admin views a field whose value comes from the platform
- **THEN** the origin reads "From platform" without a link

### Requirement: The navigation entries are named settings
The platform sidebar item SHALL read "Settings" (de "Einstellungen") and open `/platform/settings`. The tenant sidebar item SHALL keep opening `/t/$orgId/settings`.

#### Scenario: Platform sidebar
- **WHEN** the platform admin opens any platform page
- **THEN** the sidebar shows "Einstellungen" in German, linking to `/platform/settings`
