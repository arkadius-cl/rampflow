---
title: Run rampflow locally
description: Start Postgres and Mailpit, give the checkout its own ports and databases, set up and migrate the database, run the apps and the tests, check that tests do not depend on the real date, bootstrap a platform admin, and run several checkouts in parallel.
type: how-to
audience: [developer, agent]
tags: [setup, dev, testing, database, mail, worktrees]
status: stable
updated: 2026-10-19
related: [docs/decisions/ADR-0001-data-access-drizzle-node-postgres.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md]
---

# Run rampflow locally

## Prerequisites

- Node.js 24 or later.
- pnpm 12 (the version in `packageManager` in `package.json`).
- Podman with `podman compose`.

## Start the services

1. Start Postgres 18 and Mailpit. The command waits until both containers are healthy, and never recreates containers that already run, so it is safe in any checkout.

   ```sh
   pnpm db:up
   ```

   | Service | Address |
   |---|---|
   | Postgres 18 | `localhost:5432`, superuser `rampflow` / `rampflow` |
   | Mailpit SMTP | `localhost:1025` |
   | Mailpit web UI and API | <http://localhost:8025> |

2. To stop the services, run `pnpm db:down`. The data volume stays. To delete the data, run `podman compose down -v`. Other checkouts share these containers, so stop them only when no other checkout runs.

## Set up the checkout

1. Install dependencies.

   ```sh
   pnpm install
   ```

2. Write this checkout's `.env`. It holds the checkout's ports and database names on top of `.env.example`.

   ```sh
   node scripts/checkout-env.mjs --write
   ```

   Run it again after pulling a change to `.env.example`, or when an old `.env` still points `DATABASE_URL` at the superuser. The API refuses to start as a role that is a superuser or bypasses row-level security.

3. Create the app role and this checkout's database, then apply the migrations.

   ```sh
   pnpm db:setup
   pnpm db:migrate
   ```

   - `db:setup` creates the role `rampflow_app` (`LOGIN NOBYPASSRLS`, owns nothing) if it is missing and converges its attributes. Roles are cluster-wide, so every checkout runs the same idempotent step. It then creates the checkout's database if it is missing.
   - `db:migrate` applies `apps/api/drizzle/` as the owner role (`MIGRATION_DATABASE_URL`).
   - `db:reset` drops and recreates this checkout's development database and migrates it. It never touches another checkout's database.

4. Load the demo data, or create only a platform admin.

   ```sh
   pnpm db:seed
   ```

   `db:seed` runs as the owner role and is idempotent: a second run converges to the same data and resets the demo passwords. It runs the seed modules listed in `apps/api/scripts/seed-dev.ts`, one file per module under `apps/api/scripts/seed/`. Every demo account uses the password `rampflow-demo`, so `db:seed` refuses to run unless `NODE_ENV` is `development` or `test` (the checkout env sets `development`; unset counts as production).

   | Email | Org | Role |
   |---|---|---|
   | `admin@rampflow.local` | platform | `platform_admin` |
   | `admin@acme.local` | Acme Logistics (tenant, package pro) | `tenant_admin` |
   | `dispatch@acme.local` | Acme Logistics | `dispatcher` |
   | `gate@acme.local` | Acme Logistics | `gate_operator` (all sites) |
   | `dock@acme.local` | Acme Logistics | `dock_operator` (all sites) |
   | `admin@trans-pol.local` | Trans-Pol Sp. z o.o. (carrier, linked to Acme) | `carrier_admin` |

   For a real installation, create only the first platform admin. There is no sign-up; this is the only way in.

   ```sh
   pnpm admin:create --email ops@example.com --name "Ops"
   ```

   The user has no password and signs in by magic link from `/login` ("Email me a sign-in link"); the email lands in Mailpit in development.

## Run the apps

```sh
pnpm dev
```

- The API listens on `API_PORT` (3000 in the main checkout). `tsx watch` restarts it on change. Jobs run in process unless `ENABLE_JOBS=0`.
- The web app runs on `WEB_PORT` (5173). Vite forwards `/api` to the API and `/d` to the driver app on `DRIVER_PORT` (5174).

Every mutating request needs `Origin` equal to `APP_ORIGIN`, which `.env` sets to the web app's address, so call the API through the Vite proxy:

```sh
curl http://localhost:5173/api/health
# {"status":"ok","db":"ok"}
```

## Run the checks

| Command | What it runs |
|---|---|
| `pnpm lint` | Biome lint and format check, including the restricted imports (pool, tables without RLS, system actors, `asScope`). |
| `pnpm format` | Biome fixes, including formatting. |
| `pnpm typecheck` | `tsc -b` in every package, plus the e2e folder. |
| `pnpm test` | Vitest in every package. The API tests need Postgres and Mailpit. |
| `pnpm docs:check` | Doc frontmatter, `docs/INDEX.md` and catalog table freshness. |
| `pnpm i18n:derive` | Writes the derived label parts (`<module>/{nav,entitlements,settings}.json`) from the manifests and the typed i18n resources of `apps/web`. Run it after a manifest change or a new part file, then translate new labels. `--check` only reports. |
| `pnpm verify` | `lint`, `typecheck`, `test`, `docs:check` and `i18n:derive --check` in order. |

The API tests never touch the development database. Each run migrates a template database `<checkout database>_tpl`, and each Vitest worker clones it into `<checkout database>_test_<worker>`. Fixtures are written as the owner role; everything the system under test does, and every assertion about what a party sees, runs as `rampflow_app`.

## Run the end-to-end tests

```sh
pnpm test:e2e
```

This runs Playwright 1.64.1 inside the `mcr.microsoft.com/playwright:v1.64.1-noble` container with host networking. Playwright starts the API (with `ENABLE_TEST_ROUTES=1` and the job runner) and the web app (`vite --mode e2e`, without the dev tools overlay) itself. Pass spec paths to narrow the run.

The end-to-end tests never touch the development database. They run under the checkout's e2e profile (`node scripts/checkout-env.mjs --e2e`):

- The database is `<checkout database>_e2e`. Each run drops, recreates and migrates it first (`pnpm db:reset` under the profile, under 2 seconds). Every run therefore starts empty: the job runner never sees the worlds of earlier runs, and a spec that pins the API clock moves only the bookings of this run.
- Every port is the checkout's port plus 5, for example API 3005, web 5178 and driver 5179 in the main checkout. `pnpm dev` keeps running next to an e2e run, and Playwright never reuses the dev servers. It reuses only e2e servers that already listen on the e2e ports.
- The API, the web servers and the owner-role helpers in `e2e/support/` all receive the profile's `DATABASE_URL`, `MIGRATION_DATABASE_URL` and ports. Mail still goes to the shared Mailpit.

The specs in `e2e/core-loop/` (U12) pin the one API clock that every spec shares, through `POST /api/test/clock`. Their Playwright project `core-loop` therefore depends on the `staff` and `driver` projects and runs one spec at a time after them. A path filter does not apply to dependency projects, so `pnpm test:e2e e2e/core-loop` runs the whole suite. To run only the core loop, skip the dependencies:

```sh
pnpm test:e2e --project core-loop --no-deps
```

Helpers live in `e2e/support/`: `seedWorld`, `signInAs` (sets a seeded user's session cookie), `signInWithPassword`, `expectAccessible` (axe, no serious or critical violation), `latestEmailTo` and `linkIn` (Mailpit), and owner-role fixtures in `db.ts`. A unit adds its own helpers in `e2e/support/<unit>.ts`.

If Chromium runs on your host, you can run Playwright directly:

```sh
pnpm exec playwright install chromium
pnpm test:e2e:host
```

## Check that tests do not depend on today's date

Tests pin their clocks to fixed dates, so a fixture or an assertion that reads the real date can pass today and fail next month. To find such a test, run the package and API suites as if the real date were shifted:

```sh
scripts/test-at-date.sh +40d             # 40 days ahead
scripts/test-at-date.sh +400d src/kernel # extra arguments go to Vitest
```

The offset uses the libfaketime format: `+10d`, `+400d`, `-3d`, `+0d`. The script shifts the clocks of both Node and Postgres with libfaketime:

- It starts a throwaway Postgres 18 container on a free port and removes it afterwards. The shared Postgres keeps its real clock.
- It runs Vitest in a Node 24 container. The repository is mounted at its host path, so the run uses this checkout's database names.
- Mail still goes to the shared Mailpit.

The first run builds the images `localhost/rampflow-faketime-postgres:18` and `localhost/rampflow-faketime-node:24`. `+0d` gives the same result as `pnpm test`.

The script does not cover the Playwright suite. Chromium under libfaketime runs scripts but never fires the page `load` event, and a browser at the real date next to shifted servers produces failures that cannot happen in reality.

When a test needs "now", use a test clock instead of the system clock. The world fixture's sessions are valid at every test clock. `WORLD_NOW` in `apps/api/test/world.ts` is a fixed instant before the world bookings, while their driver links are valid.

## Run several checkouts in parallel

Units of one wave run in separate git worktrees on one machine. Each worktree needs its own ports and databases, while Postgres and Mailpit stay shared.

1. Create the worktree and write its environment.

   ```sh
   git worktree add ../rampflow-u4 -b u4
   cd ../rampflow-u4
   pnpm install
   node scripts/checkout-env.mjs --write
   pnpm db:setup && pnpm db:migrate
   ```

2. Check what the checkout uses. The numbers differ per worktree.

   ```sh
   node scripts/checkout-env.mjs
   # API_PORT=3730
   # WEB_PORT=5903
   # DRIVER_PORT=5904
   # APP_ORIGIN=http://localhost:5903
   # DATABASE_URL=postgres://rampflow_app:rampflow_app@localhost:5432/rampflow_rampflow_u4
   # MIGRATION_DATABASE_URL=postgres://rampflow:rampflow@localhost:5432/rampflow_rampflow_u4
   ```

How the script decides:

- The main checkout (where `.git` is a directory) keeps `rampflow` and ports 3000, 5173 and 5174.
- A worktree gets the database `rampflow_<slug>`, where the slug is the worktree directory name in lowercase with other characters replaced by `_`. Test databases derive from it (`_tpl`, `_test_<n>`, `_e2e`).
- A worktree gets port block `n` from 1 to 99: API `3000 + 10n`, web `5173 + 10n`, driver `5174 + 10n`. Its e2e profile uses the same ports plus 5. `--write` starts at a block hashed from the slug and skips blocks that other worktrees of the repository already use.
- Values resolve as the process environment, then `.env`, then the checkout defaults, then `.env.example`. Every `pnpm` script that touches a port or a database runs through `node scripts/checkout-env.mjs run -- <command>`, so a worktree without `.env` still gets its own hashed defaults.

To remove a worktree's databases, drop `rampflow_<slug>`, `rampflow_<slug>_tpl`, `rampflow_<slug>_e2e` and `rampflow_<slug>_test_*` as the superuser.

## Change the schema

Tables, indexes, checks and RLS policies live in `apps/api/src/modules/<module>/schema*.ts`. A unit branch holds exactly one generated migration, named after the unit:

```sh
pnpm db:generate --name u4    # during work, as often as needed
pnpm db:regen --name u4       # after rebasing onto main
```

Both run the same script. A regenerated migration no longer matches what `db:migrate` applied to the checkout's development database, so run `pnpm db:reset` afterwards: it drops and recreates that database and migrates it. Test databases are rebuilt on every run anyway. It deletes every file under `apps/api/drizzle/` that the merge-base with `main` does not have, restores that base's `meta/`, and generates once. On a rebase conflict in `apps/api/drizzle/meta`, take `main`'s side and run `pnpm db:regen --name <unit>`; never merge the snapshot JSON by hand. drizzle-kit diffs policy expressions, so a changed policy becomes an `ALTER POLICY` in the unit's migration.

## Read sent email

Mailpit catches every message sent to `localhost:1025` and delivers none of them. Open <http://localhost:8025>, or read messages through its API (`/api/v1/search?query=to:"..."`), as the outbox tests do.
