import { randomBytes, randomUUID } from 'node:crypto';
import { type APIRequestContext, expect } from '@playwright/test';
import pg from 'pg';
import {
  firstInstantFrom,
  type LocalDate,
  type LocalTime,
  type TimeZone,
} from '../../packages/shared/src/time/index.ts';
import type { World, WorldSide } from './auth.ts';
import { apiAs, bookingsOf } from './u5.ts';

// Plan board fixtures (U6b): what the master-data screens (U4) and the gate (U9) would set up,
// written as the owner role past RLS, and staff bookings through the API.

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

/** The world's bookings start on Monday 2 November 2026, 09:00 CET (apps/api/test/world.ts). */
export const WORLD_DAY = '2026-11-02';
/** A Berlin wall time on `day` as an ISO instant, for example `at('09:00')`. */
export const at = (wallTime: string, day = WORLD_DAY) =>
  firstInstantFrom(
    day as LocalDate,
    wallTime as LocalTime,
    'Europe/Berlin' as TimeZone,
  ).toISOString();

export interface PlanSite {
  siteId: string;
  poolId: string;
  loadTypeId: string;
  singleId: string;
  singleDockCode: string;
}

/**
 * Makes site 1 of a world side bookable: both docks in the "Ramp pool" (2 per slot), a single
 * dock "Reefer A-05", the world load type on both, open every day as `hours` says.
 */
export async function planSite(
  w: World,
  side: WorldSide = w.A,
  hours: [opens: string, closes: string] = ['06:00', '18:00'],
): Promise<PlanSite> {
  const site = side.sites[0] as { id: string } & Record<string, unknown>;
  const { rows: resources } = await db().query<{ id: string }>(
    `select id from bookable_resource where site_id = $1 and kind = 'pool'`,
    [site.id],
  );
  const { rows: docks } = await db().query<{ id: string }>(
    'select id from dock where site_id = $1 order by code',
    [site.id],
  );
  const { rows: loadTypes } = await db().query<{ id: string }>(
    'select id from load_type where site_id = $1',
    [site.id],
  );
  const poolId = resources[0]?.id as string;
  const loadTypeId = loadTypes[0]?.id as string;
  for (const dock of docks) {
    await db().query(
      `insert into resource_dock (dock_id, resource_id, resource_kind, site_id, tenant_id)
       values ($1, $2, 'pool', $3, $4)`,
      [dock.id, poolId, site.id, side.tenantId],
    );
  }
  const { rows: halls } = await db().query<{ id: string }>(
    'select id from hall where site_id = $1',
    [site.id],
  );
  const singleDockId = randomUUID();
  await db().query(
    `insert into dock (id, tenant_id, site_id, hall_id, code, door_type, temperature_zone, status)
     values ($1, $2, $3, $4, 'A-05', 'dock_leveler', 'chilled', 'active')`,
    [singleDockId, side.tenantId, site.id, halls[0]?.id],
  );
  const singleId = randomUUID();
  await db().query(
    `insert into bookable_resource (id, tenant_id, site_id, kind, name, directions, sort)
     values ($1, $2, $3, 'single', 'Reefer A-05', '{inbound,outbound}', 1)`,
    [singleId, side.tenantId, site.id],
  );
  await db().query(
    `insert into resource_dock (dock_id, resource_id, resource_kind, site_id, tenant_id)
     values ($1, $2, 'single', $3, $4)`,
    [singleDockId, singleId, site.id, side.tenantId],
  );
  for (const resourceId of [poolId, singleId]) {
    await db().query(
      `insert into load_type_resource (load_type_id, resource_id, site_id, tenant_id)
       values ($1, $2, $3, $4)`,
      [loadTypeId, resourceId, site.id, side.tenantId],
    );
  }
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await db().query(
      `insert into opening_hours (tenant_id, site_id, weekday, opens, closes)
       values ($1, $2, $3, $4, $5)`,
      [side.tenantId, site.id, weekday, ...hours],
    );
  }
  return { siteId: site.id, poolId, loadTypeId, singleId, singleDockCode: 'A-05' };
}

/** Sets a site-level setting, as an admin would on the settings screen (U3). */
export async function siteSetting(
  w: World,
  side: WorldSide,
  key: string,
  value: unknown,
): Promise<void> {
  await db().query(
    `insert into setting_value (tenant_id, site_id, key, value, updated_by)
     values ($1, $2, $3, $4, $5)
     on conflict (tenant_id, site_id, key) do update set value = excluded.value`,
    [side.tenantId, side.sites[0]?.id, key, JSON.stringify({ v: value }), w.platformAdmin.id],
  );
}

/** Up to 10 units take 30 minutes, more take 120 (MD-05 tiers, Pro has duration rules). */
export async function tieredLoadType(loadTypeId: string): Promise<void> {
  await db().query('update load_type set duration = $1 where id = $2', [
    JSON.stringify({
      kind: 'tiers',
      tiers: [
        { upTo: 10, minutes: 30 },
        { upTo: null, minutes: 120 },
      ],
    }),
    loadTypeId,
  ]);
}

export const avis = (o: { units?: number; reference?: string; plate?: string } = {}) => ({
  references: [
    { type: 'purchase_order', value: o.reference ?? `PO-${randomBytes(3).toString('hex')}` },
  ],
  counterpartyName: 'Lieferant GmbH',
  loadUnits: [{ type: 'eur_pallet', quantity: o.units ?? 4 }],
  ...(o.plate ? { vehicle: { plate: o.plate } } : {}),
});

export interface CreatedBooking {
  id: string;
  code: string;
  version: number;
}

/** A staff booking through the API, as the dispatcher's sheet sends it. */
export function staffBooking(
  request: APIRequestContext,
  side: WorldSide,
  site: PlanSite,
  o: {
    startsAt: string;
    carrier?: { id: string } | { name: string };
    resourceId?: string;
    units?: number;
    forceReason?: string;
  },
): Promise<CreatedBooking> {
  return apiAs<CreatedBooking>(
    request,
    side.users.dispatcher,
    'POST',
    `/t/${side.tenantId}/bookings`,
    {
      clientRequestId: randomUUID(),
      siteId: site.siteId,
      loadTypeId: site.loadTypeId,
      startsAt: o.startsAt,
      carrier: o.carrier ?? { id: side.carrierId },
      avis: avis({ units: o.units }),
      ...(o.resourceId ? { resourceId: o.resourceId } : {}),
      ...(o.forceReason ? { force: true, forceReason: o.forceReason } : {}),
    },
  );
}

/**
 * A walk-in the gate took in (YD-03, U9): checked in at `startsAt` on the pool with
 * `walk_in` set. Inserted directly until the gate's walk-in route exists on this branch.
 */
export async function walkIn(
  side: WorldSide,
  site: PlanSite,
  startsAt: string,
  carrierName: string,
) {
  const id = randomUUID();
  const code = randomBytes(4).toString('hex').toUpperCase();
  const end = new Date(Date.parse(startsAt) + 30 * 60_000).toISOString();
  await db().query(
    `insert into booking (id, tenant_id, site_id, resource_id, load_type_id, carrier_name, code,
       status, direction, starts_at, ends_at, blocks_until, site_time_zone, load_units,
       created_party, walk_in, checked_in_at)
     values ($1, $2, $3, $4, $5, $6, $7, 'checked_in', 'inbound', $8, $9, $9, 'Europe/Berlin', 6,
       'staff', true, $8)`,
    [
      id,
      side.tenantId,
      site.siteId,
      site.poolId,
      site.loadTypeId,
      carrierName,
      code,
      startsAt,
      end,
    ],
  );
  return { id, code };
}

/** Moves a booking to `checked_in`, as the gate's check-in would (YD-02, U9). */
export async function checkIn(bookingId: string): Promise<void> {
  await db().query(
    `update booking set status = 'checked_in', checked_in_at = now(), version = version + 1
     where id = $1`,
    [bookingId],
  );
}

/** The world's own booking of site 1 (09:00 CET on the world day). */
export const ownBooking = (side: WorldSide) => bookingsOf(side).own;

const MAILPIT = `http://${process.env.SMTP_HOST ?? 'localhost'}:8025`;

/** Waits until Mailpit holds an email to `to` whose subject contains `subject`. */
export async function emailWithSubject(to: string, subject: string): Promise<{ text: string }> {
  const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
        id = ((await res.json()) as { messages: { ID: string }[] }).messages[0]?.ID;
        return id !== undefined;
      },
      { timeout: 20_000, message: `an email to ${to} about "${subject}"` },
    )
    .toBe(true);
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return { text: ((await res.json()) as { Text: string }).Text };
}
