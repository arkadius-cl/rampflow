import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BookingStatus,
  CreatedParty,
  Direction,
  DurationKind,
  ResourceKind,
} from '@rampflow/shared/modules/booking/values';
import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import {
  DockStatus,
  DoorType,
  TemperatureZone,
  TenantStatus,
} from '@rampflow/shared/modules/core/values';
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
const PROFILES = '0009_03-tenant-onboarding';

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
const admin = withDatabase(owner, 'postgres');

/**
 * A fresh database per describe, under the worker prefix so the next run's global setup drops it
 * if this file crashed, and never one of the worker databases.
 */
function throwawayDatabase(label: string): URL {
  const name = `${workerPrefix(base)}migration_${label}_${process.pid}`;
  beforeAll(() =>
    withClient(admin, async (c) => {
      await dropDatabase(c, name);
      await ensureDatabase(c, name);
    }),
  );
  afterAll(() => withClient(admin, (c) => dropDatabase(c, name)));
  return withDatabase(owner, name);
}

async function migrateBefore(url: URL, tag: string) {
  const before = migrationsBefore(tag);
  try {
    await migrateFrom(url, before);
  } finally {
    rmSync(before, { recursive: true, force: true });
  }
}

describe('02 activated_at backfill', () => {
  const url = throwawayDatabase('02');

  it('makes tenants created before it active since creation and leaves carriers alone', async () => {
    await migrateBefore(url, BACKFILL);
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
    expect(tenantStatus({ activatedAt: rows.tenant.activated_at, suspendedAt: null })).toBe(
      TenantStatus.active,
    );
    expect(rows.carrier.activated_at).toBeNull();
  });
});

/** A pre-03 site: one hall, docks `D-01`.. of the given zones, all in the pool, one load type, one booking. */
async function pre03Site(c: pg.Client, zones: TemperatureZone[]) {
  const one = async (sql: string, params: unknown[]) =>
    (await c.query<{ id: string }>(`${sql} returning id`, params)).rows[0]?.id as string;
  const tenantId = await one('insert into org (kind, name) values ($1, $2)', [
    OrgKind.tenant,
    'Acme Logistics',
  ]);
  const siteId = await one(
    `insert into site (tenant_id, name, address_line1, postal_code, city, country, time_zone, default_locale)
     values ($1, 'Lager Hamburg', 'Am Sandtorkai 12', '20457', 'Hamburg', 'DE', 'Europe/Berlin', 'de')`,
    [tenantId],
  );
  const hallId = await one('insert into hall (tenant_id, site_id, name) values ($1, $2, $3)', [
    tenantId,
    siteId,
    'Halle 1',
  ]);
  const dockIds: string[] = [];
  for (const [i, zone] of zones.entries()) {
    dockIds.push(
      await one(
        `insert into dock (tenant_id, site_id, hall_id, code, door_type, temperature_zone, status)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, siteId, hallId, `D-0${i + 1}`, DoorType.dock_leveler, zone, DockStatus.active],
      ),
    );
  }
  const poolId = await one(
    `insert into bookable_resource (tenant_id, site_id, kind, name, directions)
     values ($1, $2, $3, $4, $5)`,
    [tenantId, siteId, ResourceKind.pool, 'Rampen', [Direction.inbound, Direction.outbound]],
  );
  for (const dockId of dockIds) {
    await c.query(
      `insert into resource_dock (dock_id, resource_id, resource_kind, site_id, tenant_id)
       values ($1, $2, $3, $4, $5)`,
      [dockId, poolId, ResourceKind.pool, siteId, tenantId],
    );
  }
  const loadTypeId = await one(
    `insert into load_type (tenant_id, site_id, name, direction, duration)
     values ($1, $2, $3, $4, $5)`,
    [
      tenantId,
      siteId,
      { de: 'Palettiert', en: 'Palletised' },
      Direction.inbound,
      { kind: DurationKind.fixed, minutes: 60 },
    ],
  );
  await c.query(
    `insert into load_type_resource (load_type_id, resource_id, site_id, tenant_id)
     values ($1, $2, $3, $4)`,
    [loadTypeId, poolId, siteId, tenantId],
  );
  const bookingId = await one(
    `insert into booking (tenant_id, site_id, resource_id, load_type_id, code, status, direction,
       starts_at, ends_at, blocks_until, site_time_zone, load_units, created_party, carrier_name)
     values ($1, $2, $3, $4, 'K7M2Q9XA', $5, $6, $7, $8, $8, 'Europe/Berlin', 20, $9, 'Trans-Pol')`,
    [
      tenantId,
      siteId,
      poolId,
      loadTypeId,
      BookingStatus.confirmed,
      Direction.inbound,
      new Date('2026-10-19T08:00:00Z'),
      new Date('2026-10-19T09:00:00Z'),
      CreatedParty.staff,
    ],
  );
  return { poolId, dockIds, loadTypeId, bookingId };
}

describe('03 dock profiles on a populated database', () => {
  const url = throwawayDatabase('03');

  it('keeps pools, memberships, load type links and bookings, as manual pools of the standard profile', async () => {
    await migrateBefore(url, PROFILES);
    await withClient(url, async (c) => {
      const s = await pre03Site(c, [TemperatureZone.ambient, TemperatureZone.ambient]);
      await migrateFrom(url, MIGRATIONS);

      const pool = await c.query('select * from bookable_resource where id = $1', [s.poolId]);
      expect(pool.rows).toEqual([
        expect.objectContaining({
          hall_id: null,
          door_type: DoorType.dock_leveler,
          temperature_zone: TemperatureZone.ambient,
          adr_allowed: false,
        }),
      ]);
      const members = await c.query(
        'select dock_id, door_type, temperature_zone, adr_allowed from resource_dock where resource_id = $1 order by dock_id',
        [s.poolId],
      );
      expect(members.rows).toEqual(
        [...s.dockIds].sort().map((dock_id) => ({
          dock_id,
          door_type: DoorType.dock_leveler,
          temperature_zone: TemperatureZone.ambient,
          adr_allowed: false,
        })),
      );
      const links = await c.query(
        'select load_type_id from load_type_resource where resource_id = $1',
        [s.poolId],
      );
      expect(links.rows).toEqual([{ load_type_id: s.loadTypeId }]);
      const booking = await c.query('select resource_id, status from booking where id = $1', [
        s.bookingId,
      ]);
      expect(booking.rows).toEqual([{ resource_id: s.poolId, status: BookingStatus.confirmed }]);
    });
  });
});

describe('03 dock profiles on a mixed pool', () => {
  const url = throwawayDatabase('03_mixed');

  it('fails on the dock profile key and leaves the database as it was before 03', async () => {
    await migrateBefore(url, PROFILES);
    await withClient(url, async (c) => {
      const s = await pre03Site(c, [TemperatureZone.ambient, TemperatureZone.frozen]);
      const applied = async () =>
        Number(
          (await c.query('select count(*) as n from drizzle.__drizzle_migrations')).rows[0]?.n,
        );
      const before = await applied();

      await expect(migrateFrom(url, MIGRATIONS)).rejects.toThrow(/resource_dock_dock_profile_fk/);

      expect(await applied()).toBe(before);
      const columns = await c.query(
        `select column_name from information_schema.columns
         where table_name in ('bookable_resource', 'resource_dock') and column_name = 'door_type'`,
      );
      expect(columns.rows).toEqual([]);
      const members = await c.query(
        'select count(*)::int as n from resource_dock where resource_id = $1',
        [s.poolId],
      );
      expect(members.rows[0]?.n).toBe(2);
    });
  });
});
