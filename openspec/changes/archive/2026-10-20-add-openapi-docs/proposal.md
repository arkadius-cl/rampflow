# Proposal

## Why

The API has about 154 routes in 30 router files, and nothing describes them in a form a person or a tool can browse. To try a route today you read the router, its zod schemas in `packages/shared` and the notes in `docs/reference/api-routes.md`, then build the request by hand. Response shapes are TypeScript interfaces, and some handlers return anonymous inline objects, so you cannot see the response shape without reading the handler. The route tables in `api-routes.md` are written by hand and can drift from the code.

This change gives the owner and later the team an always-current OpenAPI description. You can open it in Swagger UI and import it into Bruno or Postman. It also replaces the hand-written route tables with tables generated from the same source.

## What Changes

- **OpenAPI 3.1 description of the whole `/api` surface**, generated at build time into `apps/api/openapi.gen.json` and checked in. `pnpm verify` fails when the file is stale.
- **Request schemas from zod.** A project validator `validate(target, schema)` replaces `zValidator(target, schema, onInvalid)`, keeps its behaviour (404 for `param`, 422 with zod paths for `query` and `json`) and records the schema for the generator. A codemod migrates the 171 call sites.
- **Response schemas from TypeScript, not zod.** Every route declares a named response type per success status. The generator turns the TypeScript type into JSON Schema and checks that the declared type matches what the handler returns. The `*View` interfaces stay plain TypeScript.
- **Strict naming rule.** Every route response is a named, exported type in `packages/shared/src/modules/<id>/api*.ts`. A test fails for a route without one. The routes that lack one today sit on an allowlist that may only shrink.
- **Route metadata** per route: operation id, story IDs, a description (the current notes column) and hard limits. Permission and entitlement come from the existing `requirePermission`, `requireEntitlement` and `withModule` middlewares. All of it appears in the spec as `x-*` fields.
- **Swagger UI** at `/api/docs` and the spec at `/api/openapi.json`, served only when the new flag `ENABLE_API_DOCS=1` is set. Startup refuses the flag with `NODE_ENV=production`. The UI assets come from the `swagger-ui-dist` package and are served by the API, with no CDN.
- **Ready for Bruno and Postman:** a cookie `securitySchemes` entry for `rf_session`, a `servers` entry with an `{appOrigin}` variable, and examples on the request bodies. The `Origin` check stays on in development; the how-to explains the collection header it needs.
- **Generated route tables:** the per-section route tables in `docs/reference/api-routes.md` are rendered from the same metadata between markers, like the catalog tables in `module-contract.md`.
- **Docs:** a new ADR-0013, and updates to `AGENTS.md`, `api-routes.md`, `module-contract.md`, `first-module-change.md`, `architecture-overview.md` and `run-locally.md`. This includes a fix to `module-contract.md`, which says "zod request and response schemas" although responses are TypeScript interfaces today.

No breaking change to the HTTP behaviour or to the `hc` client types.

## Capabilities

### New Capabilities

- `api-description`: the machine-readable description of the HTTP API. It covers how it is generated from the routes, request schemas, named response types and route metadata, the rules that keep it complete and current, where it is served in development, and the route reference tables derived from it.

### Modified Capabilities

None. No specs exist yet under `openspec/specs/`.

## Impact

- **Code:** `apps/api/src/kernel/validate.ts` (new `validate`, plus route metadata), `kernel/access.ts` (tags its middlewares for the generator), `kernel/env.ts` (`ENABLE_API_DOCS`), `app.ts` (mounts the docs routes). All 30 `routes.*.ts` files (codemod: `validate()` plus route metadata), and the `api*.ts` files in `packages/shared` (named response types).
- **New:** `apps/api/scripts/openapi.ts` (the generator), `apps/api/openapi.gen.json`, `apps/api/src/kernel/api-docs.ts` (serves the UI and the spec), tests for completeness, naming and staleness.
- **Dependencies:** `swagger-ui-dist` (runtime, API). `typescript@6` under an npm alias as a devDependency of the API, for its compiler API. TypeScript 7 has none, and the TS 6 in the lockfile only arrives through the shadcn CLI.
- **Tooling:** a new `pnpm api:docs` (with `--check`) joins `pnpm verify`.
- **Docs and agent guidance:** see What Changes. `pnpm docs:index` runs afterwards.
- **Not affected:** production behaviour, because the docs routes are not mounted there. Authentication, the `Origin` check (ADR-0003) and RLS are unchanged.
