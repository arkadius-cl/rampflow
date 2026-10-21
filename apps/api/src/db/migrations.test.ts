import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import { TenantStatus } from '@rampflow/shared/modules/core/values';
import { DatabaseUrlVar, OrgKind } from '@rampflow/shared/values';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseOf,
  dropDatabase,
  ensureDatabase,
  requireUrl,
  withClient,
  withDatabase,
} from '../../scripts/db-setup.ts';
import { workerPrefix } from '../../test/names.ts';

// Custom migrations against a database that holds data from before them (ADR-0001, point 8).

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const BACKFILL = '0008_02-tenant-self-registration-backfill';

interface Journal {
  entries: { tag: string }[];
}

/** A copy of the migrations that stops right before `tag`. */
function migrationsBefore(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rampflow-migrations-'));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const path = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(path, 'utf8')) as Journal;
  const end = journal.entries.findIndex((e) => e.tag === tag);
  if (end < 0) throw new Error(`no migration ${tag}`);
  writeFileSync(path, JSON.stringify({ ...journal, entries: journal.entries.slice(0, end) }));
  return dir;
}

async function migrateFrom(url: URL, folder: string) {
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: folder,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } finally {
    await pool.end();
  }
}

const owner = requireUrl(DatabaseUrlVar.MIGRATION_DATABASE_URL);
const base = databaseOf(owner).replace(/_test_\d+$/, '');
// Under the worker prefix, so the next run's global setup drops it if this file crashed.
const name = `${workerPrefix(base)}migration_${process.pid}`;
const url = withDatabase(owner, name);
const admin = withDatabase(owner, 'postgres');

beforeAll(async () => {
  await withClient(admin, async (c) => {
    await dropDatabase(c, name);
    await ensureDatabase(c, name);
  });
});

afterAll(() => withClient(admin, (c) => dropDatabase(c, name)));

describe('02 activated_at backfill', () => {
  it('makes tenants created before it active since creation and leaves carriers alone', async () => {
    const before = migrationsBefore(BACKFILL);
    try {
      await migrateFrom(url, before);
    } finally {
      rmSync(before, { recursive: true, force: true });
    }
    const createdAt = new Date('2026-10-19T08:00:00Z');
    const rows = await withClient(url, async (c) => {
      const insert = `insert into org (kind, name, created_at) values ($1, $2, $3) returning id`;
      const tenant = await c.query<{ id: string }>(insert, [
        OrgKind.tenant,
        'Acme Logistics',
        createdAt,
      ]);
      const carrier = await c.query<{ id: string }>(insert, [
        OrgKind.carrier,
        'Trans-Pol',
        createdAt,
      ]);
      await migrateFrom(url, MIGRATIONS);
      const read = `select activated_at, created_at from org where id = $1`;
      return {
        tenant: (await c.query(read, [tenant.rows[0]?.id])).rows[0],
        carrier: (await c.query(read, [carrier.rows[0]?.id])).rows[0],
      };
    });
    expect(rows.tenant.activated_at).toEqual(createdAt);
    expect(tenantStatus({ activatedAt: rows.tenant.activated_at })).toBe(TenantStatus.active);
    expect(rows.carrier.activated_at).toBeNull();
  });
});
