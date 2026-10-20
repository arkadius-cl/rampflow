# api-description Specification

## Purpose

Describes the whole HTTP API as an OpenAPI document that stays in sync with the code, so developers can browse it, try routes in Swagger UI and import it into REST clients such as Bruno or Postman.

## Requirements

### Requirement: Generated OpenAPI document

The repository SHALL contain an OpenAPI 3.1 document of every route under `/api`, except the `/api/test` routes and the docs routes themselves, generated from the code by one command. The document SHALL be checked in.

#### Scenario: Every route appears

- **WHEN** the generator runs on the current code
- **THEN** the document has one operation per method and path of the app, and the path uses OpenAPI parameter syntax (`/api/t/{orgId}/sites`)

#### Scenario: Test routes are left out

- **WHEN** the app is built with test routes enabled and the generator runs
- **THEN** no path under `/api/test` appears in the document

### Requirement: Stale document fails verification

Verification SHALL fail when the checked-in document, or a generated route table, differs from what the generator produces for the current code. The failure message SHALL name the command that regenerates it.

#### Scenario: A route changes without regenerating

- **WHEN** a developer adds a field to a request schema and runs `pnpm verify` without regenerating
- **THEN** verification fails and names `pnpm api:docs`

#### Scenario: Regenerated document passes

- **WHEN** the developer runs `pnpm api:docs` and then `pnpm verify`
- **THEN** the staleness check passes

### Requirement: Request schemas from the validators

Each operation SHALL describe its path parameters, query parameters and JSON body with the same constraints the API enforces (formats, enums, bounds, required fields). The constraints come from the schemas the route validates with.

#### Scenario: Body constraints appear

- **WHEN** a route validates its body with a schema that requires a UUID `siteId` and an integer between 1 and 7
- **THEN** the operation's request body schema marks `siteId` required with format `uuid` and the integer with minimum 1 and maximum 7

#### Scenario: Validation behaviour is unchanged

- **WHEN** a client sends a malformed path id, an invalid query or an invalid body
- **THEN** the API answers 404 `not_found` for the path id, and 422 `validation_failed` with the zod issue paths for query and body, as before

### Requirement: Named response types

Every success response with a body SHALL be documented by a named, exported type from the shared package, rendered as a reusable schema component and referenced by name. Allowlisted routes are the only exception; their schema is inline. A route whose handler output does not match its declared type SHALL fail the generator.

#### Scenario: Named type becomes a component

- **WHEN** a route declares `ResourceList` for status 200
- **THEN** the document has `components.schemas.ResourceList` and the operation's 200 response references it

#### Scenario: Declared type does not match the handler

- **WHEN** a handler returns an object with a field that the declared response type lacks
- **THEN** the generator fails and names the operation, the status and the mismatch

#### Scenario: Wire format of values

- **WHEN** a response type contains a `Date` or a branded string id
- **THEN** the schema shows a string, with format `date-time` for the `Date`

### Requirement: No new route without a named response type

A check SHALL fail for any route that has no declared named response type, unless the route is on the checked-in allowlist of routes that lacked one when this capability was introduced. The check SHALL also fail when an allowlisted route has gained a named type but is still listed.

#### Scenario: New route without a type

- **WHEN** a developer adds a route without declaring its response type
- **THEN** the check fails and names the route

#### Scenario: Allowlist only shrinks

- **WHEN** an allowlisted route gets a declared named type
- **THEN** the check fails until the route is removed from the allowlist

### Requirement: Access and business metadata per operation

Each operation SHALL carry its party, its required permission, its required module or feature entitlement, the hard limits it checks, its story IDs and a description. Permission and entitlement SHALL come from the guards that actually protect the route.

#### Scenario: Guarded route

- **WHEN** a route is mounted under the yard module and requires `yard.gate`
- **THEN** its operation shows party `tenant`, permission `yard.gate` and entitlement `yard`

#### Scenario: Route without metadata

- **WHEN** a route has no operation id or no story metadata
- **THEN** the generator fails and names the route

### Requirement: Common error responses

The document SHALL describe the error envelope `{ error: { code, message, details? } }` once as a component, and every operation SHALL reference it for the error statuses its guards and validators can produce.

#### Scenario: Guarded route lists its errors

- **WHEN** a tenant route requires a permission and validates a body
- **THEN** its operation lists 401, 403, 404 and 422 with the error envelope

### Requirement: Swagger UI in development

When `ENABLE_API_DOCS=1`, the API SHALL serve Swagger UI at `/api/docs` and the document at `/api/openapi.json`, with all UI assets served by the API itself. Without the flag both paths SHALL answer 404. The API SHALL refuse to start with the flag set and `NODE_ENV=production`.

#### Scenario: Flag on

- **WHEN** a developer starts `pnpm dev` with `ENABLE_API_DOCS=1` and opens `<APP_ORIGIN>/api/docs`
- **THEN** Swagger UI loads the document without requests to third-party hosts

#### Scenario: Flag off

- **WHEN** the flag is not set
- **THEN** `GET /api/docs` and `GET /api/openapi.json` answer 404 `not_found`

#### Scenario: Production refuses the flag

- **WHEN** the API starts with `ENABLE_API_DOCS=1` and `NODE_ENV=production`
- **THEN** startup fails with a message naming `ENABLE_API_DOCS`

#### Scenario: Try it out with a session

- **WHEN** a signed-in developer opens `<APP_ORIGIN>/api/docs` and executes a mutating tenant route
- **THEN** the request carries the session cookie and the app origin and gets the same answer the web app would get

### Requirement: Importable into REST clients

The document SHALL declare the session cookie `rf_session` as its security scheme, a server URL built from an `appOrigin` variable, and an example for each JSON request body, so Bruno and Postman can import it as a working collection.

#### Scenario: Import into a REST client

- **WHEN** a developer imports `apps/api/openapi.gen.json` into Bruno or Postman
- **THEN** every operation appears as a request grouped by section, with path parameters as variables and an example body

#### Scenario: Session from the login route

- **WHEN** the developer runs `POST /api/auth/login` from the imported collection with a seed account and then a tenant route with the `Origin` header set to the app origin
- **THEN** the client reuses the `rf_session` cookie and the tenant route answers like it does for the web app

### Requirement: Route reference tables generated from the same source

The per-section route tables in `docs/reference/api-routes.md` SHALL be rendered from the same metadata as the document, between markers. The prose outside the markers stays hand-written.

#### Scenario: Table matches the routes

- **WHEN** the generator runs
- **THEN** each section's table lists exactly the operations of that section with method, path, party, permission, entitlement, story IDs, router file and description

#### Scenario: Hand edit inside the markers

- **WHEN** someone edits a row between the markers by hand
- **THEN** verification fails as stale
