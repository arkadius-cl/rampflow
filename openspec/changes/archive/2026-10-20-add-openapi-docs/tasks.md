# Tasks

## 1. Spike: TypeScript 6 against AppType

- [x] 1.1 Add `"typescript-6": "npm:typescript@6.0.x"` and `swagger-ui-dist` to `apps/api/package.json`; verify that `pnpm install` succeeds and that `node -e "require('typescript-6').version"` prints 6.x from `apps/api`
- [x] 1.2 Write a throwaway script that builds a TS 6 program from `apps/api/tsconfig.json`, resolves `ExtractSchema<AppType>` and prints the output type of `GET /api/t/:orgId/capacity/resources`, `POST /api/t/:orgId/capacity/resources` and one `/api/driver` route; verify that the printed shapes match the handlers and record the run time in design.md (design Risks)
- [x] 1.3 In the same spike, convert one named view (`ResourceView`) with a first version of the converter and import a hand-assembled three-operation OpenAPI 3.1 file into Bruno and Postman; verify the requests, folders, `appOrigin` variable and cookie login work, and settle 3.1 vs 3.0 (design Open Questions); record the result in design.md

## 2. Registry, `validate()` and `op()`

- [x] 2.1 Add `kernel/describe.ts` with the handler registry, `op()`, `type<T>()` and the `OpMeta` type (id, stories typed as story IDs, description, limits typed as `LimitKey`, responses); verify with a unit test that `op()` passes requests through and records its metadata
- [x] 2.2 Add `validate(target, schema)` to `kernel/validate.ts` on top of `zValidator` and `onInvalid`, recording `{ target, schema }`; verify with tests that a bad param answers 404, a bad query or body answers 422 with zod paths, and the registry holds the schema
- [x] 2.3 Make `requirePermission`, `requireEntitlement` and `requireModule` register their keys; verify with a unit test on a toy app that the registry returns the keys for its middlewares and that HTTP behaviour is unchanged (existing `access.test.ts` green)

## 3. Migration codemod

- [x] 3.1 Write the one-off codemod (design D12) outside the committed tree and run it: `zValidator` becomes `validate`, `op({...})` is inserted with derived ids, stories and descriptions copied from `api-routes.md`, `responses` declared where a named shared type already exists; verify that `pnpm typecheck` and `pnpm test` are green and that `grep -r zValidator apps/api/src/modules` finds nothing
- [x] 3.2 Review the codemod report: fix unmatched table rows by hand, give every operation a unique id, and write the routes without a named type to `apps/api/openapi.allowlist.json`; verify that no `routes.*.ts` chain lacks `op()` (a grep or the generator's check from 4.4)
- [x] 3.3 Update the route examples in `docs/reference/module-contract.md` ("A route", "Directory layout": responses are named TypeScript types, not zod) and `docs/tutorials/first-module-change.md` to `validate()` and `op()`; verify with `pnpm docs:check`

## 4. Generator

- [x] 4.1 Runtime half in `apps/api/scripts/openapi.ts`: import `createApp`, walk `app.routes`, join the registry entries per endpoint (guards only from the endpoint's own router chain, design Risks), map the party from the prefix table, exclude `/api/test` and the docs routes; verify with a test on a toy app with two routers on the same prefix that each endpoint gets exactly its own guards and that every route matches one party prefix
- [x] 4.2 Request schemas: `param`, `query` and `json` through `z.toJSONSchema(..., { io: 'input' })`, `:id` to `{id}`, unvalidated path params as `uuid`; verify with a test that a known body shows `required`, `format: uuid`, `minimum` and `maximum` (spec "Request schemas from the validators")
- [x] 4.3 Static half: TS 6 program, locate `op()` calls by id, read `type<T>()` per status, convert with the converter (design D5: brands, `Date`, time types, enums, `$ref` components, failing on unsupported kinds and name clashes); verify with converter unit tests per supported kind and per failure, each failure naming the property path
- [x] 4.4 Checks: declared type vs `ExtractSchema<AppType>` output in both directions, undeclared success statuses, missing or duplicate `op()`, routes without a named type that are not on the allowlist, and allowlisted routes that already have one; verify with fixture routes that each check fails with operation and reason (spec "Named response types", "No new route without a named response type")
- [x] 4.5 Document assembly: error component from `kernel/errors.ts`, derived error statuses (design D8), `x-permission`, `x-entitlement`, `x-limits`, `x-stories`, tags per section, `servers` with `appOrigin`, the `session` and driver cookie schemes with `security: []` on anonymous, public and token routes, body examples from the sampler; verify with a test that validates `openapi.gen.json` against the OpenAPI 3.1 schema and asserts the yard check-in operation's party, permission and entitlement
- [x] 4.6 Wire `pnpm api:docs` and `pnpm api:docs --check` (root and `apps/api` scripts), add `--check` to `pnpm verify`, print run time and allowlist size; verify that changing a request schema without regenerating makes `pnpm verify` fail with a message naming `pnpm api:docs`, and that it passes after regenerating

## 5. Route tables in api-routes.md

- [x] 5.1 Add the start and end markers around each section's table in `docs/reference/api-routes.md`, add the `SECTIONS` map from router file to section in the generator, and render uniform tables (Method, Path, Party, Permission, Entitlement, Story, Router, Notes); verify that `pnpm api:docs` rewrites only the content between the markers and that a hand edit inside the markers fails `pnpm api:docs --check`
- [x] 5.2 Update the "Validation" section and the intro of `api-routes.md` to `validate()`, named response types and the generated tables, and add an "OpenAPI" section (file, command, flag, allowlist); verify with `pnpm docs:check`

## 6. Swagger UI in development

- [x] 6.1 Add `ENABLE_API_DOCS` to `kernel/env.ts` with the production refinement; verify with a test that `ENABLE_API_DOCS=1` with `NODE_ENV=production` fails startup naming the flag
- [x] 6.2 Add `kernel/api-docs.ts` (`/api/openapi.json`, `/api/docs` with its own `index.html` and init script, `/api/docs/*` from `swagger-ui-dist`) and mount it in `buildApi` via `AppOptions.apiDocs`; exempt the docs routes from route-case coverage like `/api/test`; verify with app tests that both paths answer 404 without the flag, that the JSON equals `openapi.gen.json` with it, and that the HTML references no third-party host
- [x] 6.3 Pass the flag through `checkout-env.mjs` so `pnpm dev` can enable it; open `<APP_ORIGIN>/api/docs` signed in as a seed dispatcher, run `POST /api/t/{orgId}/capacity/resources` with "Try it out", and verify a 201 like in the web app (spec "Try it out with a session")

## 7. Docs and agent guidance

- [x] 7.1 Write `docs/decisions/ADR-0013-openapi-from-routes-and-typescript.md` (frontmatter per `docs/CONVENTIONS.md`, tag `adr`): TypeScript types over zod for responses, build-time generation, the operation-id join, TS 6 for the checker, dev-only serving; verify with `pnpm docs:check`
- [x] 7.2 `docs/how-to/run-locally.md`: sections "Browse the API in Swagger" (flag, open via `APP_ORIGIN` and not the API port, and why) and "Import the API into Bruno or Postman" (file or URL, `appOrigin` and `orgId` variables, login with a seed account, collection-level `Origin` header, re-import after changes); verify by following the steps on a fresh `pnpm dev`
- [x] 7.3 `docs/explanation/architecture-overview.md`: a short paragraph on the API description and a link to ADR-0013; verify with `pnpm docs:check`
- [x] 7.4 `AGENTS.md`: add `pnpm api:docs` to the commands table, add to the code conventions that routes use `validate()` and `op()` and that responses are named types in `packages/shared`, and point to `apps/api/openapi.gen.json` as the route reference; verify that `pnpm verify` is green
- [x] 7.5 Run `pnpm docs:index`; verify that `docs/INDEX.md` lists ADR-0013 and that `pnpm docs:check` passes

## 8. Integration check

- [x] 8.1 On a clean checkout, run `pnpm verify` and `scripts/test-at-date.sh +40d`; verify both are green and that `openapi.gen.json` does not change between the two runs (the document must not depend on the date)
- [x] 8.2 Import the final `openapi.gen.json` into Bruno and Postman, log in with a seed account, and run one read and one write per party prefix (tenant, carrier, driver, public); verify the answers match the web and driver apps
