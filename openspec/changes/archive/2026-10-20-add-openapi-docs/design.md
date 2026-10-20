# Design

## Context

See proposal.md for the motivation. These facts about the current code shape the design:

- Routes are plain Hono chains (`new Hono<AppEnv>().get(path, ...middlewares, handler)`) in 30 `routes.<party>.ts` files. All of them are mounted in `apps/api/src/modules/index.ts`, and `app.ts` mounts that under `/api`. `app.routes` lists every handler and middleware with method and full path. `route-coverage.test.ts` already walks it.
- Requests are validated with `zValidator(target, schema, onInvalid)` from `@hono/zod-validator` (171 calls). The schemas are zod 4 and live in `packages/shared/src/modules/<id>/api*.ts`. zod 4 has `z.toJSONSchema()`.
- Responses are whatever the handler passes to `c.json(value, status)`. Their types are TypeScript interfaces in `packages/shared` (`ResourceView`, ...), inline objects or inferred service return types. The `hc` client gets them through `AppType`, where Hono wraps every output in `JSONParsed<T>`, a mapped type.
- Guards are middleware factories: `requirePermission(key)`, `requireEntitlement(key)` and `withModule(id, router)`, which uses `requireModule(id)`. Hard limits are checked inside services (`withinLimit`), so the route chain cannot see them.
- TypeScript 7 (the Go compiler) is the project compiler and has no JS compiler API. `typescript@6.0.3` is in the lockfile only as a transitive dependency of the shadcn CLI, through ts-morph.
- `docs/reference/module-contract.md` already gets catalog tables rendered between markers (`packages/shared/src/catalog-doc.ts`, `scripts/docs.mjs`). The route tables in `docs/reference/api-routes.md` are hand-written: one table per section, with a free-text notes column.
- The session cookie `rf_session` is not `Secure` in development (`core/auth/sessions.ts`). `requireSameOrigin` rejects mutating requests whose `Origin` is not an app origin (ADR-0003). The Vite dev server proxies `/api` to the API.

## Goals / Non-Goals

**Goals:**

- One build-time generator produces `apps/api/openapi.gen.json` and the route tables, and fails loudly on anything it cannot describe.
- Response schemas come from TypeScript types and are checked against what the handlers return, so the document cannot claim a shape the code does not produce.
- Route files keep their style. Each route gains one metadata call, and `zValidator(...)` becomes `validate(...)`.

**Non-Goals:**

- Runtime validation of responses.
- Public or production hosting of the docs, API tokens, API versioning.
- Generating clients from the spec. The web app keeps using `hc`.
- Describing the business 409 reasons as separate response schemas. They stay in the description text, as today in the notes column.
- Automatic re-sync into Bruno or Postman. You import the spec again after a change.

## Decisions

### D1. Generate at build time; the document is a checked-in file

`pnpm api:docs` (`apps/api/scripts/openapi.ts`, run through `checkout-env.mjs run` like the other API scripts) writes `apps/api/openapi.gen.json` and the route tables. `pnpm api:docs --check` joins `pnpm verify`.

- *Why:* the TypeScript checker needs seconds, which is too slow for server start. A checked-in file shows API shape changes in review, can be imported into Bruno or Postman without a running server, and follows the existing generated-file pattern (`docs:index`, `i18n:derive`).
- *Alternative:* build the document at runtime from zod only, as `hono-openapi` and `@hono/zod-openapi` do. Rejected: both need zod response schemas, and the decision is TypeScript types for responses.

### D2. The generator has a runtime half and a static half, joined by operation id

```
runtime half (tsx imports createApp)            static half (TS 6 checker)
------------------------------------            --------------------------
app.routes -> method, full path                 route files -> op({ id, responses: { 200: type<T>() } })
handler registry -> op metadata, validators,                  -> id -> declared T per status, router file
                    guards                      AppType       -> real output per path, method, status
            \                                               /
             +------------- join on operation id ----------+
                                   |
                     check declared T against real output
                                   |
                  openapi.gen.json + api-routes.md tables
```

- Runtime: importing the app gives exact full paths, methods, the zod schema objects and the guard keys, without re-implementing Hono's mounting.
- Static: only the checker knows type names and can compare types.
- *Join key:* the operation id literal inside `op({ id: '...' })`. Hono routes carry no source location, and rebuilding full paths from the AST would duplicate the mounting in `modules/index.ts`. The generator fails on duplicate ids, on routes without `op()`, and on `op()` calls it cannot find statically.

### D3. Route metadata through one `op()` middleware

New `apps/api/src/kernel/describe.ts`:

```ts
op({
  id: 'booking.capacity.listResources',  // <module>.<area>.<verbNoun>, unique
  stories: ['MD-03'],
  description: 'Lists the resources, optionally of one site.',  // Markdown, the old notes cell
  limits: ['core.max_sites'],             // optional, typed LimitKey, for guards the chain cannot see
  responses: { 200: type<ResourceList>() },
})
```

`op()` returns a no-op middleware and records the runtime part (id, stories, description, limits) in a module-level `WeakMap<Function, OpMeta>`. `type<T>()` returns a phantom value that only the static half reads. `op()` goes first in each chain.

- *Alternative:* read the output type straight from `AppType` and skip declarations. Rejected: `JSONParsed<T>` is a mapped type and loses the alias name, so the generator could not produce named components or enforce the naming rule.
- *Alternative:* response type names as strings. Rejected: a typo is not a compile error.

### D4. Declared response types are checked against the handler output

For each operation and declared status, the static half builds a probe in a synthetic source file. It reads the endpoint output from `ExtractSchema<AppType>` and compares it with `JSONParsed<T>` of the declared type. They must be assignable both ways. A mismatch fails with operation, status and the checker's message. A success status that the handler can return but `op()` does not declare also fails.

### D5. Our own TypeScript-to-JSON-Schema converter

The converter walks checker types and covers the subset the API uses: primitives, literals, unions (string-literal unions become `enum`), arrays, tuples, object types with optional properties, `null`, `Record<string, T>` and named aliases or interfaces. A named type from `packages/shared` becomes `components.schemas.<Name>` with a `$ref`. A name used by two different types fails the run.

Wire formats: `Date` becomes `string` with format `date-time`. A brand intersection (`string & { __brand }`) becomes its primitive. The branded time types from `packages/shared/src/time` map to `format: date`, or to `string` with the pattern the time module enforces. Anything else (functions, symbols, unresolved generics) fails the run and names the path to the offending property.

- *Alternative:* `ts-json-schema-generator`. Rejected: it brings its own TypeScript 5 and a second program, it works per type name and not per route, and we need our own checker for D4 anyway.

### D6. TypeScript 6 as an aliased dev dependency of the API

`apps/api/package.json` adds `"typescript-6": "npm:typescript@6.0.x"`. The generator imports `typescript-6` and builds a program from `apps/api/tsconfig.json`. The project's `typescript` stays 7. Depending on the transitive copy from shadcn would break silently when shadcn moves on.

### D7. Request side: `validate()` records the schema

`validate(target, schema)` in `kernel/validate.ts` returns `zValidator(target, schema, onInvalid)` and registers `{ target, schema }` for that middleware in the registry. `onInvalid` stays internal. The generator turns schemas into JSON Schema with `z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })`:

- `param` becomes path parameters (`:orgId` becomes `{orgId}`; parameters without a validator, such as `orgId`, become `string` with format `uuid`).
- `query` becomes query parameters.
- `json` becomes the request body.

Refinements (`refine`, `superRefine`) cannot be expressed in JSON Schema. Their messages go into the schema description where zod exposes them; otherwise they show up only as 422 at runtime.

### D8. Guards, party and errors

- `requirePermission`, `requireEntitlement` and `requireModule` register their key in the same registry. For each endpoint, the generator collects the guards from the `app.routes` entries that Hono runs for it: entries with the same method or `ALL` whose path pattern matches the endpoint path (see Risks). These become `x-permission`, `x-entitlement` (module or feature) and `x-limits`.
- Party comes from a prefix table in the generator that mirrors "Areas and parties" in `api-routes.md` (`/api/t/{orgId}` is `tenant`, ...). Every route must match exactly one prefix.
- Error responses are derived from that metadata:
  - 401 when the party needs a session, a driver cookie or a token.
  - 403 when there is a permission or entitlement guard, or the method is mutating (`Origin`).
  - 404 when there are path parameters or an org prefix.
  - 422 when there is a `query` or `json` validator.
  - 409 when `limits` is set.

  Each references `components.schemas.Error`, which is built from the error codes in `kernel/errors.ts`.

### D9. Serving the UI in development

- `env.ts` gets `ENABLE_API_DOCS` with the same production refinement as `ENABLE_TEST_ROUTES`.
- `AppOptions.apiDocs` mirrors `testRoutes`. When it is set, `buildApi` mounts `kernel/api-docs.ts`:
  - `GET /openapi.json` reads `openapi.gen.json` once at mount.
  - `GET /docs` serves a small `index.html` and an init script, both from our own files with no inline script.
  - `GET /docs/*` serves `swagger-ui-dist` assets through `serveStatic` from the package's absolute path.
- Swagger UI is configured with `withCredentials: true`. Opened via `APP_ORIGIN` (the Vite proxy), its requests carry the session cookie and the right `Origin`, so "Try it out" behaves like the web app. The docs routes are excluded from the generated document and from the route-case coverage, as `/api/test` is.

### D10. REST client readiness

- `servers: [{ url: '{appOrigin}', variables: { appOrigin: { default: 'http://localhost:5173' } } }]`.
- `components.securitySchemes.session = { type: 'apiKey', in: 'cookie', name: 'rf_session' }` is the global default. Anonymous and public operations override it with `security: []`, driver routes declare the `rf_driver` cookie scheme, and token routes keep `security: []` with the token in the body.
- One tag per route-table section, which Bruno and Postman turn into folders.
- Each JSON body gets an `example` from a small schema sampler: first enum value, the minimum of each bound, a fixed UUID, required fields only.
- The required `Origin` header stays out of the spec, because it is a property of the client and not of an operation. `run-locally.md` explains setting it once on the collection.

### D11. Route tables rendered between markers

- Each section of `api-routes.md` gets `<!-- routes:<section>:start -->` and `<!-- routes:<section>:end -->` around its table. A `SECTIONS` table in the generator maps router files to sections, because sections do not follow modules: `core/sites` belongs to "Master data and capacity".
- The columns are the same for every section: Method, Path, Party, Permission, Entitlement, Story, Router, Notes. Notes is `op().description`.
- The section prose, including the "Unit Ux." line, stays outside the markers.
- `api:docs --check` compares both outputs. `docs:check` stays as it is.

### D12. Migration with a one-off codemod

A one-off script (TS 6 API, not committed) does the migration in three steps:

1. Rewrites `zValidator(t, s, onInvalid)` to `validate(t, s)`.
2. Inserts `op({...})` into every chain. The id is derived from module, area and handler. Stories and description are copied from the matching row of the current `api-routes.md` tables, matched on method and path.
3. Declares `responses` where the `c.json` argument's type is already a named type exported from `packages/shared`.

Routes it cannot match or name go to `apps/api/openapi.allowlist.json`, and table rows without a route are reported. The diff is reviewed and committed like hand-written code.

## Risks / Trade-offs

- [TS 6 cannot read the TS 7 tsconfig, or resolves `AppType` differently] → Task 1 is a spike that resolves `ExtractSchema<AppType>` for three routes with TS 6 before any migration. If it fails, the fallback is a dedicated `tsconfig.openapi.json` that TS 6 accepts.
- [The generator is slow inside `pnpm verify`] → measured in the spike at about 4.5 s for program and checker. It measures itself and prints the time. The program is built once per run. If it exceeds about 30 s, cache it keyed by a hash of the API and shared sources.
- [Hono's `JSONParsed` turns some types into shapes the converter does not support] → the converter fails loudly with the property path, so no wrong schema ships. The type gets fixed or the route stays on the allowlist.
- [Middleware order: a router-level `.use()` guard reaches sibling routers on the same prefix] → checked on 2026-10-20: Hono applies a sibling router's `.use()` middleware (`ALL /prefix/*`) to every route under that prefix at runtime. So the generator collects guards the way Hono matches them, by method and path pattern over `app.routes`, and not per router chain. Per-chain collection would under-report what actually protects a route. The toy-app test in 4.1 pins this behaviour. No such case exists today: the four router-level `.use(requirePermission(...))` sit on prefixes that no other router shares.
- [The allowlist becomes permanent] → the check fails when an allowlisted route already has a type. The allowlist size is printed on every run.
- [The descriptions copied from the notes column are long table prose] → acceptable for version 1; they are now editable next to the code.

## Migration Plan

No deployment step. The docs routes are not mounted without the flag, and production refuses the flag. To roll back, revert the change. The generated files and the `op()` calls have no runtime effect beyond the registry.

## Spike results (tasks 1.2, 1.3, 2026-10-20)

- **TS 6 against `AppType`:** `typescript@6.0.3` reads `apps/api/tsconfig.json` without errors (with `noEmit`, `composite: false`). A synthetic probe file resolves `ExtractSchema<AppType>`. The outputs of `GET` and `POST /api/t/:orgId/capacity/resources` and `GET /api/driver/booking` match the handlers (`{ items: ResourceView[] }`, `ResourceView` with status 201, the driver view). Building the program takes about 1.3 s and the first type query about 3.2 s, so about 4.5 s per run. No cache is needed.
- **`JSONParsed` already applies the wire format.** On the `AppType` side, brands are gone (`id: string`) and `Date` is `string`. Aliases such as `DriverChannel` survive. The D4 comparison therefore compares `JSONParsed<Declared>` with a type that is already JSON-shaped.
- **Converter v1** turns `ResourceView` into a `$ref` component with `required`, string-literal enums and `anyOf` with `null`.
- **REST clients.** A three-operation OpenAPI 3.1 file (login, list, create) was imported with the Bruno CLI 4.2.1 (`bru import openapi`) and with `openapi-to-postmanv2`, the converter behind Postman's importer, then run with `bru run` and `newman` against `pnpm dev` through the Vite proxy. The desktop apps were not driven by hand.
  - Both accept 3.1. **Decision: emit 3.1.**
  - Tags become folders. The server variable becomes `baseUrl = {{appOrigin}}` with the default. Path parameters become request variables, and `orgId` stays empty until the user sets it. Body examples become the request body.
  - Both map the cookie `apiKey` scheme to a header (`rf_session: {{apiKey}}`) and ignore `security: []` per operation. This is harmless: after `POST /api/auth/login` the client's cookie jar sends `rf_session`, and both runs reached the tenant route signed in. The how-to says to leave the collection auth empty or set it to none.
  - Postman names requests after `summary`, otherwise after a split operation id. The generator emits a short `summary`.
  - The body sampler must satisfy array minimums. A hand-written example with `dockIds: []` got a 422 because `dockIds` needs at least one item.
- **Task 6.3 needs a tenant admin**, not a dispatcher: `booking.manage_resources` is granted only to `tenant_admin`.

## Open Questions

None open. 3.1 vs 3.0 is settled above.
