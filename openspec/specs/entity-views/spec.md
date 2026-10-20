# entity-views Specification

## Purpose

Makes every entity a user manages addressable by its own URL, so a link in a chat, an email or a bookmark opens exactly that entity and, for views with tabs, exactly that tab.

## Requirements

### Requirement: Every managed entity has its own view
Every entity with its own id that users create, open or manage on its own SHALL have a detail view at the path of its list followed by its id (`<list path>/$<entity>Id`). Rows that exist only as part of a parent and are edited inside the parent's view (opening hours, closures, entitlement overrides, setting values, invitations, duration rules) SHALL NOT need a view of their own.

#### Scenario: Tenant detail by URL
- **WHEN** a platform admin opens `/platform/tenants/<id of Tenant A>` directly in a new browser tab
- **THEN** the page shows Tenant A without visiting the tenant list first

#### Scenario: Dependent row has no view
- **WHEN** a tenant admin edits an opening hours row of a site
- **THEN** the edit happens on the site's hours view and the URL names the site, not the row

### Requirement: Lists link to the entity views
Every row of a list whose entity has a detail view SHALL link to that view with a real link, so it opens with a click, with Enter and in a new tab.

#### Scenario: Open a tenant in a new tab
- **WHEN** the platform admin middle-clicks the name of Tenant A in the tenant list
- **THEN** a new tab opens `/platform/tenants/<id of Tenant A>` and the list stays in the first tab with its filters

### Requirement: Detail tabs are child routes
A detail view with tabs SHALL make each tab a child route `<detail path>/<tab>`, with the first tab as the index route at the detail path itself. Selecting a tab SHALL change the URL and add a history entry; opening a tab's URL SHALL show that tab selected.

#### Scenario: Site hours tab by URL
- **WHEN** a tenant admin opens `/t/<orgId>/sites/<siteId>/hours`
- **THEN** the site view shows with its "Hours and closures" tab selected

#### Scenario: Back returns to the previous tab
- **WHEN** a tenant admin opens a site, selects "Load types" and presses back
- **THEN** the URL is the site's index path and the "Halls, docks and pools" tab is selected

### Requirement: Unknown or foreign ids show no access
Opening an entity view with an id that does not exist, or that belongs to another tenant, carrier or site the user may not see, SHALL show the area's "no access" page inside the shell. It SHALL NOT redirect to another entity and SHALL NOT reveal whether the id exists.

#### Scenario: Id of another tenant
- **WHEN** a tenant admin of tenant A opens `/t/<orgId of A>/sites/<siteId of a site of tenant B>`
- **THEN** the page shows "no access" and no data of the site

#### Scenario: Unknown tenant id
- **WHEN** a platform admin opens `/platform/tenants/<random uuid>`
- **THEN** the page shows "no access" instead of a loading placeholder

### Requirement: Entity views keep the sign-in redirect
An entity view or tab URL opened without a session SHALL lead to the sign-in page and, after signing in, back to the same URL.

#### Scenario: Shared link before sign-in
- **WHEN** a signed-out platform admin opens `/platform/tenants/<id of Tenant A>` and signs in
- **THEN** the browser shows `/platform/tenants/<id of Tenant A>`
