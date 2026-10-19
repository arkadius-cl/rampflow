---
title: Run rampflow locally
description: Start Postgres and Mailpit, give the checkout its own ports and databases, set up and migrate the database, run the apps and the tests, bootstrap a platform admin, and run several checkouts in parallel.
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

4. Create the first platform admin. There is no sign-up; this is the only way in.

   ```sh
   pnpm admin:create --email ops@example.com --name "Ops"
   ```

   The command runs as the owner role and is idempotent. The user signs in by magic link once U2 ships sign-in.

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
| `pnpm verify` | `lint`, `typecheck`, `test` and `docs:check` in order. |

The API tests never touch the development database. Each run migrates a template database `<checkout database>_tpl`, and each Vitest worker clones it into `<checkout database>_test_<worker>`. Fixtures are written as the owner role; everything the system under test does, and every assertion about what a party sees, runs as `rampflow_app`.

## Run the end-to-end tests

```sh
pnpm test:e2e
```

This runs Playwright 1.64.1 inside the `mcr.microsoft.com/playwright:v1.64.1-noble` container with host networking and passes the checkout's ports and database URLs into it. Playwright starts the API and the web app itself, or reuses them if `pnpm dev` already runs. Pass spec paths to narrow the run.

If Chromium runs on your host, you can run Playwright directly:

```sh
pnpm exec playwright install chromium
pnpm test:e2e:host
```

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
- A worktree gets the database `rampflow_<slug>`, where the slug is the worktree directory name in lowercase with other characters replaced by `_`. Test databases derive from it (`_tpl`, `_test_<n>`).
- A worktree gets port block `n` from 1 to 99: API `3000 + 10n`, web `5173 + 10n`, driver `5174 + 10n`. `--write` starts at a block hashed from the slug and skips blocks that other worktrees of the repository already use.
- Values resolve as the process environment, then `.env`, then the checkout defaults, then `.env.example`. Every `pnpm` script that touches a port or a database runs through `node scripts/checkout-env.mjs run -- <command>`, so a worktree without `.env` still gets its own hashed defaults.

To remove a worktree's databases, drop `rampflow_<slug>`, `rampflow_<slug>_tpl` and `rampflow_<slug>_test_*` as the superuser.

## Change the schema

Tables, indexes, checks and RLS policies live in `apps/api/src/modules/<module>/schema*.ts`. A unit branch holds exactly one generated migration, named after the unit:

```sh
pnpm db:generate --name u4    # during work, as often as needed
pnpm db:regen --name u4       # after rebasing onto main
```

Both run the same script. A regenerated migration no longer matches what `db:migrate` applied to the checkout's development database, so run `pnpm db:reset` afterwards: it drops and recreates that database and migrates it. Test databases are rebuilt on every run anyway. It deletes every file under `apps/api/drizzle/` that the merge-base with `main` does not have, restores that base's `meta/`, and generates once. On a rebase conflict in `apps/api/drizzle/meta`, take `main`'s side and run `pnpm db:regen --name <unit>`; never merge the snapshot JSON by hand. drizzle-kit diffs policy expressions, so a changed policy becomes an `ALTER POLICY` in the unit's migration.

## Read sent email

Mailpit catches every message sent to `localhost:1025` and delivers none of them. Open <http://localhost:8025>, or read messages through its API (`/api/v1/search?query=to:"..."`), as the outbox tests do.
