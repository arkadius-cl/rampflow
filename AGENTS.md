# rampflow

Multi-tenant dock and yard management SaaS for small and mid-sized warehouse operators. Carriers book slots with the avis, drivers get one link with the slot, the safety briefing and the dock call, and gate and dock staff run the yard from the same booking.

Monorepo: `apps/api` (Hono 4, Drizzle on Postgres 18), `apps/web` (Vite 8, React 19, TanStack Router and Query, shadcn/ui on Base UI, Tailwind v4), `apps/driver` (driver PWA), `packages/shared` (module contract, zod schemas, time), `packages/i18n` (catalogs), `e2e` (Playwright).

## Start here

Read `docs/INDEX.md` first. It lists every doc with a one-line description. Then open what your task touches:

- **Architecture**: `docs/explanation/architecture-overview.md`. How the apps, packages, request scope, manifests, booking engine and jobs fit together.
- **Scope**: `docs/explanation/mvp-scope.md`. Stories (BK-04, YD-07, ...), entitlements, packages, settings, NFRs.
- **Your unit**: `docs/explanation/delivery-plan.md`. Status of the units, owned files, interfaces, required tests, and the rules for shared files.
- **Contracts**: `docs/reference/` (data model, module contract, booking lifecycle, API routes). Every route with its request and response schemas: `apps/api/openapi.gen.json`.
- **Why**: `docs/decisions/ADR-*.md`. Read the ADR before changing anything it decides.

## Commands

| Command | Use |
|---|---|
| `pnpm db:up` | Start Postgres and Mailpit (podman). Tests need it. |
| `pnpm db:seed` | Load the demo data. Accounts are in `docs/how-to/run-locally.md`. |
| `pnpm dev` | Run the API, the web app and the driver app, reachable from the LAN at the printed `APP_ORIGIN`. |
| `pnpm verify` | Lint, typecheck, unit and integration tests, docs check, i18n check, API description check. Green before every commit. |
| `pnpm test:e2e` | Playwright inside the pinned container, on a fresh `<checkout db>_e2e` and ports +5, never the dev database or `pnpm dev`. Pass spec paths to narrow it, without `--` (`pnpm test:e2e e2e/yard`); with `--` the whole suite runs. |
| `pnpm format` | Biome fixes. |
| `pnpm docs:index` | Regenerate `docs/INDEX.md` and the catalog tables in `docs/reference/module-contract.md`. Run after changing any doc or manifest. |
| `pnpm i18n:derive` | Write the label parts derived from the manifests and `apps/web/src/lib/i18n-resources.gen.ts`. Run after changing a manifest or adding a part file. |
| `pnpm api:docs` | Write `apps/api/openapi.gen.json` and the route tables in `docs/reference/api-routes.md` (ADR-0013). Run after changing a route, a request schema or a response type. |
| `pnpm db:generate --name <unit>`, `pnpm db:regen --name <unit>` | Generate your unit's migration; regenerate it after rebasing onto `main` (ADR-0001). |
| `pnpm docs:screens` | Capture the doc screenshots against a running `pnpm dev` with the dev seed. |

Mail sent in dev and tests lands in Mailpit: <http://localhost:8025>.

## Working in a unit

- Stay inside the files your unit owns. For a shared file, follow its rule in the delivery plan's "Shared files" table.
- Manifests, packages and the registry in `packages/shared` are the contract. When you need a new key, permission or setting, write it in your report; the coordinator lands it with `docs/how-to/add-a-module-or-entitlement.md`.
- One generated migration per unit, named after the unit. Express tables, indexes, checks and policies in the Drizzle schema.
- End your report with every deviation from the contract and the reason.

## Code conventions

- **Types first.** Name the data shape, then write logic. Derive types from zod schemas and the manifests (`PermissionKey`, `SettingValue<K>`, ...). Parse external data at the boundary; trust it inside.
- **Imports.** `import * as z from 'zod'`. Relative imports carry the `.ts` extension. Shared code: `@rampflow/shared` or `@rampflow/shared/modules/<id>/<file>`.
- **TypeScript 7.** No `baseUrl`; use `paths`. Every tsconfig lists its `types` explicitly.
- **Module layout.** Follow "Directory layout" in `docs/reference/module-contract.md`: `schema*.ts`, `<area>/routes.<party>.ts`, `<area>/route-cases.ts`, `emails/<name>.tsx`, `jobs/<name>.ts`.
- **Tenancy.** Handlers use `c.var.db`, the request transaction opened by `scoped()` (ADR-0002). Every query also filters by `tenant_id` or `carrier_id` itself; RLS is the backstop.
- **Routes** start with `op({ id, stories, description, responses })` from `kernel/describe.ts` and validate with `validate(target, schema)` from `kernel/validate.ts`. A JSON response is `type<Name>()` with `Name` a named type exported from `packages/shared/src/modules/<id>/api*.ts`; `pnpm api:docs` fails for a route without one unless it is on `apps/api/openapi.allowlist.json`, which only shrinks.
- **Every route gets a route case** in its `route-cases.ts`: foreign tenant, foreign site, missing permission, entitlement off. Routes under `/api/me`, `/api/auth` and `/api/public` get `accountCases` instead. `route-coverage.test.ts` fails for a route without one.
- **Every new table** gets an `ORACLE` rule in `apps/api/src/db/rls.test.ts` and rows in `apps/api/test/model.ts`, or the party matrix fails.
- **Booking status** changes only through `transitionBooking` (ADR-0005).
- **Time.** Instants are UTC `Date`s; calendar math uses the site zone through `packages/shared/src/time` (ADR-0012). Domain code reads `now` from the injected `Clock`.
- **Errors.** Throw `ApiError` with a code from `docs/reference/api-routes.md`; validation failures come back as 422 with zod paths.
- **Strings** live in `packages/i18n/locales/<locale>/<module>/<part>.json`, in every locale of the module's set (ADR-0009). `nav.json`, `entitlements.json` and `settings.json` are derived: run `pnpm i18n:derive`, then translate the placeholders.
- **Comments** explain a non-obvious why in one line. Names and types carry the what.

## UI conventions

- Use the original shadcn components first: `pnpm dlx shadcn@latest add <component>` from the app directory. Compose them before writing a new primitive.
- Forms: react-hook-form with `Controller` and shadcn `Field`, `FieldLabel`, `FieldDescription`, `FieldError`; zod schemas from `packages/shared` through `zodResolver`.
- Gate routes with `guard({ permission, entitlement })` and actions with `useAccess()`; build the sidebar with `navFor` (module contract, "Web gating").
- Office screens (carrier, tenant office, platform admin) target 1920 × 1080; screenshots and the `staff` Playwright project use that viewport.
- Show times in site time with the zone label. Touch targets on gate, dock and driver screens are at least 44 CSS px. Status never relies on color alone.

## Tests

- Test behavior through the public interface: HTTP routes, service functions, the UI. Assert the effect a story names, including absence (no email sent, no row written).
- Vitest runs against real Postgres; each test creates its own tenants through the world fixture. Race conditions use two real connections.
- Playwright: one `describe` per story ID, in `e2e/<module>/<story-id>.spec.ts`. Read emails through the Mailpit API. Run axe on each story's main screen.
- Tests never depend on today's date. Use the injected clock and `WORLD_NOW` from `apps/api/test/world.ts`. `scripts/test-at-date.sh +40d` runs the suites with the Node and Postgres clocks shifted; run it when you touch time-dependent tests.
- A test that writes platform-level rows relies on the cleanup in `apps/api/test/setup.ts`; any other global state it creates, it removes itself.

## Shared machine

Several checkouts run in parallel on one machine (`node scripts/checkout-env.mjs --write` gives each its own ports and databases).

- Stop only processes you started, by PID or session. Never `pkill -f` or `killall` with a pattern: the other checkouts run identical command lines.
- Never use bare `git stash`; the stash stack is shared by all worktrees. Use a WIP commit.
- On a rebase conflict in a generated file (`apps/web/src/routeTree.gen.ts`, `apps/web/src/lib/i18n-resources.gen.ts`, `apps/api/openapi.gen.json`, `docs/INDEX.md`), take either side and regenerate it. Never `git rebase --skip`: it drops the whole commit.

## Docs

- Every Markdown file under `docs/` has the frontmatter from `docs/CONVENTIONS.md` and sits in the Diátaxis folder of its type. ADRs go to `docs/decisions/ADR-NNNN-<slug>.md` with type `explanation` and tag `adr`.
- After any doc or manifest change, run `pnpm docs:index`. `pnpm verify` fails on a stale index or stale catalog tables.

## Commits

- Small, single-purpose commits with `pnpm verify` green. Leave `todo.md` out of commits. `.audit/` holds the coordinator's decision trail; units do not edit it.
- End every commit message with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
