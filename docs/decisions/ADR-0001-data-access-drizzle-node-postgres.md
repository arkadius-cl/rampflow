---
title: ADR-0001 Data access with Drizzle and node-postgres
description: Why rampflow uses Drizzle 0.45 on node-postgres, where schema files live, and how parallel branches produce migrations without numbering conflicts.
type: explanation
audience: [agent, developer]
tags: [adr, database, drizzle, migrations, postgres]
status: stable
updated: 2026-10-19
related: [docs/explanation/research/tech-architecture.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md]
---

# ADR-0001: Data access with Drizzle and node-postgres

Status: accepted, 2026-10-19. Revised 2026-10-19 during U1: one baseline holds every SQL function, `db:generate` and `db:regen` are one command, and test databases are per checkout.

## Context

The scaffold talks to Postgres through postgres.js, only for the health check. The technical research recommends Drizzle 0.45 with node-postgres, because Drizzle keeps tables, indexes and RLS policies in one typed source and generates SQL migrations from it. Drizzle v1 is still a release candidate.

Two constraints make the migration workflow the hard part:

- Implementation runs in parallel git worktrees, several units per wave. Each unit adds tables.
- drizzle-kit 0.31 keeps a linear `meta/_journal.json` and a full schema snapshot per migration. Two branches that each run `drizzle-kit generate` produce the same next number and two snapshots that each lack the other branch's tables. A textual merge of those files is wrong even when git reports no conflict, because the next `generate` diffs against an incomplete snapshot.

## Options considered

| Option | For | Against |
|---|---|---|
| Drizzle 0.45 + node-postgres (`pg`) | Drizzle's default driver. `drizzle-orm/node-postgres/migrator` runs migrations on the same driver. `pg.Pool` hands out a dedicated client per transaction, which the request-scoped `set_config` needs. | Callback-style API under the hood; Drizzle hides it. |
| Drizzle 0.45 + postgres.js | Already in the scaffold. Tagged templates. | Two ways to run SQL once Drizzle arrives. Less common in Drizzle's docs and issue tracker. |
| Kysely + kysely-codegen | Strong types, DB-first. | Hand-written migrations, no RLS policy declarations, no schema in TypeScript. |
| Raw postgres.js | Smallest dependency set. | Every row type written by hand. Nothing checks queries against the schema. |

For migrations under parallel work:

| Option | Verdict |
|---|---|
| Timestamp prefixes (`migrations.prefix: 'timestamp'`) | Removes file name collisions only. The journal and snapshots still diverge. |
| One migration folder and journal per module | Cross-module foreign keys reference tables outside the module's snapshot. drizzle-kit 0.31 does not support that reliably. |
| `drizzle-kit push` on branches, generate only on main | Branch tests would run on a different schema path than main. Pushed schema skips custom SQL. |
| **Regenerate on rebase** | Each branch carries at most one generated migration. Before merge, a script drops the branch's migration files, restores main's journal and snapshots, and runs `generate` once. The result is always a correct diff against main. |

## Decision

1. **Driver.** Use `pg@8.23.1` with `drizzle-orm@0.45.4` and `drizzle-kit@0.31.11`. Remove `postgres` (postgres.js) from `apps/api` in U1 and move the health check to the pool.
2. **Query style.** Use the core query builder (`db.select().from(...)`) and the `sql` template. Do not use the relational query API (`db.query.*` with `relations()`), so the later move to Drizzle v1 does not require rewriting queries. Create the client as `drizzle(pool)` without a schema object.
3. **Schema location.** Each module owns its tables in `apps/api/src/modules/<module>/schema*.ts`. `drizzle.config.ts` uses the glob `./src/modules/*/schema*.ts`. No file lists all tables, so adding a table never edits a shared file.
4. **Ids.** Primary keys are `uuid` with default `uuidv7()` (Postgres 18). In TypeScript, ids are branded per entity (`Id<'booking'>`), parsed at the API boundary.
5. **Two database roles.**
   - `MIGRATION_DATABASE_URL` connects as the owner role. It runs migrations and owns every table. In dev this is the compose superuser `rampflow`.
   - `DATABASE_URL` connects as `rampflow_app`: `LOGIN NOBYPASSRLS`, owns nothing, and receives `SELECT, INSERT, UPDATE, DELETE` through default privileges.
   - `pnpm db:setup` (`apps/api/scripts/db-setup.ts`) creates or converges `rampflow_app` idempotently in dev and test and creates the checkout's database. Production provisions both roles outside the app. The API refuses to start as a superuser or a role with `rolbypassrls`.
6. **Baseline migration.** U1 writes `0000_baseline.sql` by hand (`drizzle-kit generate --custom`). It creates the extensions (`btree_gist`, `pgcrypto`, `citext`), the `app` schema with every SQL function a policy calls ([ADR-0002](ADR-0002-tenancy-isolation-rls.md): the GUC accessors, `app.site_allowed`, `app.linked_tenant`, and the security definer helpers `app.shares_org` and `app.user_by_email`), and the default privileges for `rampflow_app`. It sets `check_function_bodies = off`, so `app.linked_tenant()` can name `tenant_carrier_link` before the generated migration creates it; a policy that calls a missing function would fail `CREATE POLICY`. There is no second custom migration. The test run migrates an empty template database every time, which proves a first `db:migrate` passes.
7. **Everything after the baseline is generated** from the TypeScript schema: tables, checks, partial and composite indexes, composite foreign keys, and RLS policies through `pgPolicy`, built by the helpers in `apps/api/src/db/rls.ts`. U1 lands every table of the data model in its module's `schema*.ts` with its policies; later units change those files only for the deviations their reports list. drizzle-kit 0.31 diffs policy expressions (`ALTER POLICY`), so a changed predicate needs no custom SQL.
8. **No custom SQL on feature branches.** If a unit needs SQL that the Drizzle schema cannot express, it stops and the coordinator lands that SQL on main first. This keeps `db:regen` mechanical.
9. **Parallel branches.**
   - `pnpm db:generate --name <unit-id>` and `pnpm db:regen --name <unit-id>` run the same script (`apps/api/scripts/db-regen.ts`). It deletes every file under `apps/api/drizzle/` that the merge-base with `main` lacks, checks out that base's `meta/` folder, and runs `drizzle-kit generate --name <unit-id>` once. A branch therefore holds exactly one migration however often the unit generates.
   - Before merging, the unit (or the integrator) rebases onto main and runs `pnpm db:regen --name <unit-id>`, now against main itself. A rebase conflict in `apps/api/drizzle/meta` needs no hand merge: take main's side (or run the script, which checks out main's `meta/`), regenerate, and continue.
   - The integrator merges units one at a time in wave order and runs `pnpm verify` after each merge. A unit is never merged with more than one migration.
10. **Tests.** Vitest `globalSetup` drops and migrates a template database `<checkout db>_tpl` once per run as the owner role and drops the previous run's worker databases. Each worker clones `<checkout db>_test_<VITEST_POOL_ID>` from it on first use. The checkout database name comes from `DATABASE_URL`, which `scripts/checkout-env.mjs` makes unique per worktree (`rampflow` in the main checkout, `rampflow_<slug>` elsewhere), so parallel checkouts never share a test database. The system under test connects as `rampflow_app`; fixtures are written and absence is checked through a second pool on `MIGRATION_DATABASE_URL`. Tests isolate through fresh tenants, not through rollback, so commit-time behavior (constraint violations, lock waits) stays real.

## Consequences

- A reviewer reads one generated SQL file per unit, named after the unit.
- Merges inside a wave serialize at the migration folder. That is the only intended serialization point, and `db:regen` makes it a one-command step.
- Moving to Drizzle v1 later is `pnpm add drizzle-orm@1 drizzle-kit@1`, `drizzle-kit up`, and switching any `drizzle-zod` imports to `drizzle-orm/zod`. The regen rule still applies to v1's folder layout.
- API contracts are hand-written zod schemas in `packages/shared`, not `drizzle-zod` output, because the wire shapes differ from rows (an avis response joins `avis` and `avis_reference`). Repository functions map rows to contract types.
