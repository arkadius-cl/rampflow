# site-opening-hours Specification

## Purpose

Makes weekly opening hours part of creating a site, so a new site can offer slots as soon as it has a dock, and gives the admin prefilled templates to confirm instead of an empty week.

## Requirements

### Requirement: Creating a site requires weekly hours
`POST /api/t/:orgId/sites` SHALL require `hours`: a list of one to 70 weekly windows `{ weekday, opens, closes }` with the rules of `PUT /api/t/:orgId/capacity/hours` (weekday 1 to 7, `opens` before `closes`, `24:00` allowed as `closes`, no overlapping windows on one day). The site, its hours, its seeded load types and its holidays SHALL be written in one transaction, and the hours SHALL be the site's hours, not a resource's.

#### Scenario: Site with the one-shift template
- **WHEN** the admin creates the site "Bremerhaven" with five windows Monday to Friday 06:00 to 14:00
- **THEN** the response is 201 and `GET /api/t/:orgId/capacity/hours?siteId=<id>` returns those five windows with `resourceId: null`

#### Scenario: Site without hours
- **WHEN** the admin sends `POST /api/t/:orgId/sites` without `hours`, or with an empty list
- **THEN** the response is 422 with an issue at the path `["hours"]` and no site exists

#### Scenario: Overlapping windows
- **WHEN** the admin sends two Monday windows 06:00 to 14:00 and 13:00 to 22:00
- **THEN** the response is 422 with an issue at the path `["hours", 1]` and no site exists

#### Scenario: Editing a site leaves its hours alone
- **WHEN** the admin renames the site with `PATCH /api/t/:orgId/sites/:siteId`
- **THEN** the site's hours are unchanged, and hours are edited only on the hours tab as before

### Requirement: The site form offers hour templates
The "New site" form SHALL contain an "Opening hours" section with three choices: "One shift" (Monday to Friday 06:00 to 14:00), "Two shifts" (Monday to Friday 06:00 to 22:00) and "Custom". "One shift" SHALL be preselected. Each template SHALL show its windows before saving. "Custom" SHALL start from the windows of the template chosen last and SHALL allow several windows per day, for example a lunch break, with the same week editor as the hours tab.

#### Scenario: Preselected template
- **WHEN** the admin opens "New site"
- **THEN** "One shift" is selected and the form shows Monday to Friday 06:00 to 14:00, Saturday and Sunday closed

#### Scenario: Custom hours with a break
- **WHEN** the admin picks "Custom", sets Monday to 06:00 to 12:00 and 12:30 to 18:00, and saves
- **THEN** the new site's hours tab shows both Monday windows

#### Scenario: Validation in the form
- **WHEN** the admin enters a custom window that closes before it opens
- **THEN** the form shows the error at that window and sends nothing

### Requirement: A new site with a dock offers slots
A site created with hours SHALL offer start times as soon as it has an active dock in a resource with a load type, without another setup step.

#### Scenario: First slots
- **WHEN** the admin creates a site with the one-shift template, a hall and a dock, and asks for staff availability of the seeded load type "Parcel / van" (15 minutes, no buffer) on a Monday that is not a public holiday, with the default 30-minute grid
- **THEN** the offered starts run from 06:00 to 13:30 site time
