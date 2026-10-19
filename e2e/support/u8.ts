import { randomBytes, randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';
import pg from 'pg';
import type { WorldSide, WorldUser } from './auth.ts';
import { apiAs } from './u5.ts';
import type { PlanSite } from './u6b.ts';

// Carrier portal fixtures (U8): carrier bookings through the portal API, the site settings and
// phone the master-data and settings screens would write, and the wizard's day buttons.

let pool: pg.Pool | undefined;
export function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;

/** A site-local day in Berlin, `offset` days from today. */
export function berlinDay(offset = 0): string {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** The accessible name of a day button in the slot picker, as the en UI writes it. */
export const dayButton = (page: Page, day: string) =>
  page.getByRole('button', {
    name: new RegExp(
      `^${new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'UTC' }).format(
        new Date(`${day}T00:00:00Z`),
      )}:`,
    ),
  });

export const portalAvis = (o: { units?: number; plate?: string } = {}) => ({
  references: [{ type: 'purchase_order', value: `PO-${randomBytes(3).toString('hex')}` }],
  counterpartyName: 'Lieferant GmbH',
  loadUnits: [{ type: 'eur_pallet', quantity: o.units ?? 4 }],
  vehicle: { plate: o.plate ?? 'WGM 4521K' },
  driver: { name: 'Jan Kowalski', locale: 'pl' },
});

export interface PortalBooking {
  id: string;
  code: string;
  version: number;
  startsAt: string;
}

/** Books as a carrier user through POST /c/:orgId/at/:tenantId/bookings. */
export function carrierBooking(
  request: APIRequestContext,
  side: WorldSide,
  site: PlanSite,
  o: { startsAt: string; user?: WorldUser; carrierId?: string; units?: number },
): Promise<PortalBooking> {
  return apiAs<PortalBooking>(
    request,
    o.user ?? side.users.carrier_user,
    'POST',
    `/c/${o.carrierId ?? side.carrierId}/at/${side.tenantId}/bookings`,
    {
      clientRequestId: randomUUID(),
      siteId: site.siteId,
      loadTypeId: site.loadTypeId,
      startsAt: o.startsAt,
      avis: portalAvis({ units: o.units }),
    },
  );
}

/** Lets the rival carrier book `startsAt` until the API refuses: the slot is then full. */
export async function fillSlot(
  request: APIRequestContext,
  side: WorldSide,
  site: PlanSite,
  startsAt: string,
): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const res = await request.post(`/api/c/${side.rivalCarrierId}/at/${side.tenantId}/bookings`, {
      data: {
        clientRequestId: randomUUID(),
        siteId: site.siteId,
        loadTypeId: site.loadTypeId,
        startsAt,
        avis: portalAvis(),
      },
      headers: { Cookie: `rf_session=${side.users.rival_user.sessionToken}`, Origin: APP_ORIGIN },
    });
    if (res.status() === 409) return;
    expect(res.status(), await res.text()).toBe(201);
  }
  throw new Error(`slot ${startsAt} never filled`);
}

export async function setSitePhone(siteId: string, phone: string): Promise<void> {
  await db().query('update site set phone = $1 where id = $2', [phone, siteId]);
}

/** Links a carrier to another tenant, as an accepted invitation would (U7). */
export async function linkCarrier(tenantId: string, carrierId: string): Promise<void> {
  await db().query(
    `insert into tenant_carrier_link (tenant_id, carrier_id, status, source)
     values ($1, $2, 'active', 'invitation') on conflict do nothing`,
    [tenantId, carrierId],
  );
}

/** The driver_access rows of a booking's shareable link, newest first. */
export async function driverLinks(bookingId: string) {
  const { rows } = await db().query<{ id: string; revoked_at: Date | null }>(
    `select id, revoked_at from driver_access where booking_id = $1 and channel = 'link'
     order by created_at desc`,
    [bookingId],
  );
  return rows;
}
