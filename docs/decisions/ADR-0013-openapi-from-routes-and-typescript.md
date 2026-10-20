---
title: ADR-0013 OpenAPI description generated from the routes, zod request schemas and TypeScript response types
description: Why the API description is a checked-in OpenAPI 3.1 file built at build time from the running app and the TypeScript checker, why response shapes stay TypeScript types, how operations are joined by id, why the generator uses TypeScript 6, and why Swagger UI is served only in development.
type: explanation
audience: [agent, developer]
tags: [adr, api, openapi, routes, typescript, zod]
status: stable
updated: 2026-10-20
related: [docs/reference/api-routes.md, docs/reference/module-contract.md, docs/how-to/run-locally.md, docs/decisions/ADR-0003-authentication-self-built-sessions.md]
---

# ADR-0013: OpenAPI description generated from the routes, zod request schemas and TypeScript response types

Status: accepted, 2026-10-20.

## Context

The API has about 150 routes in 30 router files. Nothing described them in a form a person or a tool can browse. To try a route you read the router, its zod schemas and the notes in [API routes](../reference/api-routes.md), and built the request by hand. The route tables there were written by hand and could drift from the code.

Requests are validated with zod 4, which can produce JSON Schema. Responses are whatever a handler passes to `c.json()`. Their types are TypeScript interfaces in `packages/shared` (`ResourceView`, ...), inline objects or inferred service types. The project compiles with TypeScript 7, which has no JavaScript compiler API.

## Options considered

| Option | Verdict |
|---|---|
| `@hono/zod-openapi` or `hono-openapi`: describe each route with zod request and response schemas, build the document at runtime | Needs a zod schema for every response. That duplicates the `*View` interfaces and adds runtime weight for documentation only. |
| `ts-json-schema-generator` for the response types | Brings its own TypeScript 5 and a second program. Works per type name, not per route, and cannot check a declared type against the handler. |
| Hand-written OpenAPI file | Drifts like the hand-written tables did. |
| **Build-time generator: routes and zod schemas from the running app, response types from the TypeScript checker, joined by operation id** | One source per fact, checked in CI, no runtime cost. |

## Decision

- **A checked-in file, built at build time.** `pnpm api:docs` writes `apps/api/openapi.gen.json` (OpenAPI 3.1) and the route tables of [API routes](../reference/api-routes.md). `pnpm verify` runs it with `--check`. The checker needs about 5 seconds, which is too slow for server start. A file shows API changes in review and imports into Bruno or Postman without a running server.
- **Responses are TypeScript types, not zod.** Every route declares, per success status, `type<Name>()`, `noBody` or `file('<media type>')` in `op()`. A JSON `Name` is a named type exported from `packages/shared/src/modules/<module>/api*.ts` and becomes `components.schemas.<Name>`. The generator converts it with its own TypeScript-to-JSON-Schema converter. `Date` becomes `date-time`, brands become their primitive, and the time types of [ADR-0012](ADR-0012-time-handling.md) get their format or pattern. It fails on any kind it cannot represent and names the property path.
- **Declared types are checked against the handlers.** For every declared status the generator reads the handler's output from `ExtractSchema<AppType>` and requires it to be assignable to `JSONParsed<Name>` and the reverse. A success status the handler can return but `op()` does not declare also fails. The document therefore cannot claim a shape the code does not produce.
- **Requests come from the validators.** `validate(target, schema)` replaces `zValidator(target, schema, onInvalid)` with the same 404 and 422 behaviour and records the schema. The generator converts it with `z.toJSONSchema(schema, { io: 'input' })`.
- **Two halves joined by operation id.** The runtime half imports `createApp` and walks `app.routes`. It reads the full paths and methods, the `op()` metadata, the validators and the guards. The guards are `requirePermission`, `requireEntitlement` and `requireModule`, which record their key. Guards are collected the way Hono runs them, by method and path pattern, so a sibling router's `.use()` on the same prefix counts. The static half finds `op({ id })` in the source and checks the types. Hono routes carry no source location, and rebuilding full paths from the syntax tree would duplicate the mounting in `modules/index.ts`. The literal id is the join key. Missing, duplicate and unfound ids fail the run.
- **TypeScript 6 for the checker.** `apps/api` has `"typescript-6": "npm:typescript@6.0.x"` as a dev dependency, and the generator builds its program from `apps/api/tsconfig.json`. Relying on the TS 6 copy that the shadcn CLI pulls in would break silently when shadcn moves on.
- **An allowlist that only shrinks.** Routes whose responses had no named type when this was introduced are listed in `apps/api/openapi.allowlist.json`. Their schema is derived from the handler's output and written inline. The generator fails for an unlisted route without a named type and for a listed route that has one.
- **Swagger UI only in development.** With `ENABLE_API_DOCS=1` the API serves Swagger UI at `/api/docs`, from the `swagger-ui-dist` package and our own page with no CDN, and the document at `/api/openapi.json`. Startup refuses the flag with `NODE_ENV=production`. Opened through `APP_ORIGIN`, "Try it out" carries the session cookie and the app origin, so the `Origin` check ([ADR-0003](ADR-0003-authentication-self-built-sessions.md)) stays on.

## Consequences

- Every new route needs `op()` with a unique id, story IDs and a description, and a named response type in `packages/shared`. The notes column of the route tables moved into `op().description`, next to the code.
- Changing a request schema, a response type or a route means running `pnpm api:docs`. `pnpm verify` names the command when the file is stale.
- The `409 conflict` reasons stay prose in the description. Refinements (`refine`, `superRefine`) are not in the schema; they show up as 422 at runtime.
- The `hc` client and the HTTP behaviour are unchanged. The registry that `op()`, `validate()` and the guards write to is never read while a request is handled.
- REST clients map the cookie security scheme to a header and ignore `security: []` per operation. The session still works through their cookie jar after `POST /api/auth/login` ([Run locally](../how-to/run-locally.md)).
