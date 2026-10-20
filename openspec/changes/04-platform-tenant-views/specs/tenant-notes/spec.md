# Spec Delta

## Purpose

Gives the platform team a shared, internal history per tenant: free notes from support and sales, and the suspensions and reactivations with their reasons. Nobody outside the platform can read it.

## ADDED Requirements

### Requirement: The platform admin adds a note to a tenant
A platform admin with `core.manage_tenants` SHALL add a note to a tenant. The note has a text of 1 to 2,000 characters after trimming. The note SHALL record the author and the time and SHALL have the kind "Note". The API SHALL answer 201 with the note.

#### Scenario: Add a note
- **WHEN** the platform admin adds the note "Called Anna, onboarding on Monday" to tenant A
- **THEN** the response is 201 with the text, the kind "note", the admin's name and the time
- **AND** the Notes tab of tenant A lists it first

#### Scenario: Empty note
- **WHEN** the admin sends a note of only spaces
- **THEN** the API answers 422 with an issue at `["body"]` and nothing is stored

### Requirement: The Notes tab lists the tenant's history
The Notes tab SHALL be a data table of the tenant's notes. Columns: time, kind (Note, Suspended, Reactivated), author and text. It SHALL filter by kind, search the text, and sort by time, newest first by default. Filters, search, sort and paging SHALL run on the server and live in the URL. The form to add a note SHALL sit above the table.

#### Scenario: Suspension history
- **WHEN** tenant A was suspended, reactivated, and then annotated
- **THEN** the Notes tab lists the note, the "Reactivated" entry and the "Suspended" entry in this order, each with its author, time and reason

#### Scenario: Filter by kind
- **WHEN** the admin filters the kind by "Suspended"
- **THEN** only suspension entries are listed

### Requirement: Notes are append-only
No route SHALL change or delete a note. The database SHALL refuse updates and deletes of notes by the application role. Notes SHALL be deleted only together with their tenant.

#### Scenario: Database refuses an update
- **WHEN** code under the platform party runs an update or a delete on a note
- **THEN** no row changes

### Requirement: Only the platform reads notes
Notes SHALL be readable and writable by the platform party only. Tenant staff, carriers, drivers, public visitors, token holders and jobs SHALL read no note, even of their own tenant.

#### Scenario: Tenant reads its own notes table
- **WHEN** a query on the notes table runs under tenant A's scope
- **THEN** it returns no row, although tenant A has notes

### Requirement: A note outlives its author's account
When the author's user account is deleted, the note SHALL stay and show "Deleted user" as the author.

#### Scenario: Author removed
- **WHEN** the platform admin who wrote a note is deleted
- **THEN** the note is still listed with the author "Deleted user"
