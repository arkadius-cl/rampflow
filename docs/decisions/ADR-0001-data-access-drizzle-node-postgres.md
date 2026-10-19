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

Status: accepted, 2026-10-19.

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
   - `apps/api/scripts/db-setup.ts` creates `rampflow_app` idempotently in dev and test. Production provisions both roles outside the app.
6. **Baseline migration.** U1 writes `0000_baseline.sql` by hand (`drizzle-kit generate --custom`). It creates the `app` schema, the GUC helper functions from [ADR-0002](ADR-0002-tenancy-isolation-rls.md), the extensions (`btree_gist`, `pgcrypto`, `citext`) and the default privileges for `rampflow_app`. After the generated core tables, U1 adds a second custom migration with `app.linked_tenant()`, because a SQL function body may only reference tables that already exist.
7. **Everything after the baseline is generated** from the TypeScript schema: tables, checks, partial and composite indexes, composite foreign keys, and RLS policies through `pgPolicy`, built by the helpers in `apps/api/src/db/rls.ts`.
8. **No custom SQL on feature branches.** If a unit needs SQL that the Drizzle schema cannot express, it stops and the coordinator lands that SQL on main first. This keeps `db:regen` mechanical.
9. **Parallel branches.**
   - A unit generates its migration with `pnpm db:generate --name <unit-id>` as often as it likes during development.
   - Before merging, the unit (or the integrator) runs `pnpm db:regen` on a branch rebased onto main. The script deletes every file under `apps/api/drizzle/` that is not on main, checks out main's `meta/` folder, and runs `drizzle-kit generate --name <unit-id>` once.
   - The integrator merges units one at a time in wave order and runs `pnpm verify` after each merge. A unit is never merged with more than one migration.
10. **Tests.** Vitest `globalSetup` migrates a template database `rampflow_tpl` once per run as the owner role. Each worker clones `rampflow_test_<VITEST_POOL_ID>` from it and connects as `rampflow_app`. Tests isolate through fresh tenants, not through rollback, so commit-time behavior (constraint violations, lock waits) stays real.

## Consequences

- A reviewer reads one generated SQL file per unit, named after the unit.
- Merges inside a wave serialize at the migration folder. That is the only intended serialization point, and `db:regen` makes it a one-command step.
- Moving to Drizzle v1 later is `pnpm add drizzle-orm@1 drizzle-kit@1`, `drizzle-kit up`, and switching any `drizzle-zod` imports to `drizzle-orm/zod`. The regen rule still applies to v1's folder layout.
- API contracts are hand-written zod schemas in `packages/shared`, not `drizzle-zod` output, because the wire shapes differ from rows (an avis response joins `avis` and `avis_reference`). Repository functions map rows to contract types.
