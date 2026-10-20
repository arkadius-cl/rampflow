import { randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import { LoadStatus } from '../../packages/shared/src/modules/booking/values.ts';
import type { World } from './auth.ts';

// Yard fixtures for the gate and dock specs (U9), written as the owner: bookings of world A's
// site 1 around the real now, in the state a spec starts from.

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

/** What /api/test/seed returns for a site beyond the e2e `World` type. */
export interface YardSite {
  id: string;
  hallId: string;
  dockIds: [string, string];
  resourceId: string;
  loadTypeId: string;
}

export const siteOf = (w: World) => w.A.sites[0] as unknown as YardSite;

const MINUTE = 60_000;
export const minutesFromNow = (m: number) => new Date(Date.now() + m * MINUTE);

/**
 * Makes world A's site 1 take bookings of its load type and puts both docks into its pool, so
 * walk-ins find a resource and the call dialog suggests the docks.
 */
export async function poolDocks(w: World): Promise<void> {
  const s = siteOf(w);
  for (const dockId of s.dockIds) {
    await db().query(
      `insert into resource_dock (dock_id, resource_id, resource_kind, site_id, tenant_id)
       values ($1, $2, 'pool', $3, $4) on conflict do nothing`,
      [dockId, s.resourceId, s.id, w.A.tenantId],
    );
  }
  await db().query(
    `insert into load_type_resource (load_type_id, resource_id, site_id, tenant_id)
     values ($1, $2, $3, $4) on conflict do nothing`,
    [s.loadTypeId, s.resourceId, s.id, w.A.tenantId],
  );
}

export interface Visit {
  carrier: string;
  plate: string;
  /** Slot start in minutes from now. */
  start: number;
  status?: LoadStatus;
  /** Check-in in minutes from now, for on-site states. */
  checkedIn?: number;
  dockId?: string;
  phone?: string;
}

/** A booking of world A's site 1 with its avis; returns its id and code. */
export async function seedVisit(w: World, v: Visit): Promise<{ id: string; code: string }> {
  const s = siteOf(w);
  const code = randomBytes(4).toString('hex').toUpperCase();
  const status = v.status ?? LoadStatus.confirmed;
  const startsAt = minutesFromNow(v.start);
  const checkedInAt =
    status === LoadStatus.confirmed ? null : minutesFromNow(v.checkedIn ?? v.start);
  const { rows } = await db().query<{ id: string }>(
    `insert into booking (tenant_id, site_id, resource_id, load_type_id, carrier_id, carrier_name,
       code, status, direction, starts_at, ends_at, blocks_until, site_time_zone, load_units,
       created_party, dock_id, checked_in_at, called_at, punctuality, punctuality_minutes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'inbound', $9, $10, $10, 'Europe/Berlin', 12,
       'carrier', $11, $12, $13, $14, $15)
     returning id`,
    [
      w.A.tenantId,
      s.id,
      s.resourceId,
      s.loadTypeId,
      w.A.carrierId,
      v.carrier,
      code,
      status,
      startsAt,
      new Date(startsAt.getTime() + 30 * MINUTE),
      v.dockId ?? null,
      checkedInAt,
      ['called', 'at_dock', 'loading'].includes(status) ? checkedInAt : null,
      checkedInAt ? 'on_time' : null,
      checkedInAt ? 0 : null,
    ],
  );
  const id = rows[0]?.id as string;
  await db().query(
    `insert into avis (booking_id, tenant_id, site_id, carrier_id, counterparty_name, load_units,
       plate, driver_name, driver_phone)
     values ($1, $2, $3, $4, 'Lieferant GmbH', '[{"type":"eur_pallet","quantity":12}]', $5, 'Jan Nowak', $6)`,
    [id, w.A.tenantId, s.id, w.A.carrierId, v.plate, v.phone ?? null],
  );
  await db().query(
    `insert into avis_reference (booking_id, tenant_id, site_id, carrier_id, type, value, value_norm)
     values ($1, $2, $3, $4, 'delivery_note', $5, $5)`,
    [id, w.A.tenantId, s.id, w.A.carrierId, `LS-${code}`],
  );
  return { id, code };
}

/** A published briefing for every site of tenant A, so check-in needs an acknowledgement. */
export async function publishBriefing(w: World): Promise<void> {
  const { rows } = await db().query<{ id: string }>(
    `insert into safety_instruction (tenant_id, name, all_sites) values ($1, 'Site rules', true)
     returning id`,
    [w.A.tenantId],
  );
  await db().query(
    `insert into safety_version (tenant_id, instruction_id, version, status, published_at)
     values ($1, $2, 1, 'published', now())`,
    [w.A.tenantId, rows[0]?.id],
  );
}

export async function bookingStatus(id: string): Promise<string> {
  const { rows } = await db().query<{ status: string }>(
    'select status from booking where id = $1',
    [id],
  );
  return rows[0]?.status ?? 'missing';
}

/**
 * Opens a station screen and waits for its site clock, so the first assertion does not race a
 * cold dev server on a busy machine.
 */
export async function openStation(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByText('Site time')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main')).not.toBeEmpty({ timeout: 30_000 });
}

/** Buttons, button links, inputs, selects and tabs of a station screen and its dialogs: 44 CSS px. */
export async function expectTouchTargets(page: Page): Promise<void> {
  const targets = page.locator(
    ':is(main, [role="dialog"]) :is(button, a[data-slot="button"], input, select, [role="tab"])',
  );
  const small: string[] = [];
  for (const target of await targets.all()) {
    const box = await target.boundingBox();
    if (box && (box.height < 44 || box.width < 44)) {
      const name = (await target.getAttribute('aria-label')) ?? (await target.textContent()) ?? '';
      small.push(`"${name.trim().slice(0, 30)}" ${box.width}x${box.height}`);
    }
  }
  expect(small).toEqual([]);
}
