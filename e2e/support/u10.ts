import { createHash, randomInt, randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';
import pg from 'pg';
import { deriveToken } from '../../apps/api/src/kernel/tokens.ts';
import { OnSiteStatus } from '../../packages/shared/src/modules/booking/values.ts';
import { DriverLocale } from '../../packages/shared/src/values/locales.ts';
import { TokenPurpose } from '../../packages/shared/src/values/tokens.ts';
import { seedWorld, type World, type WorldSide } from './auth.ts';

// Driver PWA fixtures (U10): seeded bookings with their link tokens, a published briefing
// through the authoring API, and owner-side reads and writes for what the yard screens (U9)
// will do through their own UI.

export const APP_ORIGIN =
  process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const DRIVER_PREVIEW = `http://localhost:${Number(process.env.DRIVER_PORT ?? 5174) + 1}`;

export interface WorldBooking {
  id: string;
  siteId: string;
  carrierId: string;
  code: string;
  driverToken: string;
  driverAccessId: string;
}

export type DriverWorld = World & {
  A: WorldSide & { bookings: Record<'own' | 'rival' | 'otherSite', WorldBooking> };
  B: WorldSide & { bookings: Record<'own' | 'rival' | 'otherSite', WorldBooking> };
};

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

export async function driverWorld(request: APIRequestContext): Promise<DriverWorld> {
  const w = (await seedWorld(request)) as DriverWorld;
  // Bookings start on 2026-11-02; move them to today so the links stay valid in real time.
  const ids = [w.A, w.B].flatMap((s) => Object.values(s.bookings).map((b) => b.id));
  await db().query(
    `update booking set starts_at = now() + interval '2 hours',
       ends_at = now() + interval '150 minutes', blocks_until = now() + interval '150 minutes'
     where id = any($1::uuid[])`,
    [ids],
  );
  await db().query(
    `update driver_access set expires_at = now() + interval '7 days' where booking_id = any($1::uuid[])`,
    [ids],
  );
  return w;
}

/** The PWA link of a token: `/d#<token>` (ADR-0008). */
export const linkOf = (token: string) => `/d#${token}`;
export const previewLinkOf = (token: string) => `${DRIVER_PREVIEW}/d#${token}`;

/**
 * Gives the page its own client address (TRUST_PROXY in playwright.config.ts), so the exchange
 * limit of 10 per minute counts this spec only.
 */
export const randomAddress = () => `203.0.${randomInt(0, 255)}.${randomInt(1, 255)}`;

export async function ownAddress(page: Page): Promise<string> {
  const ip = randomAddress();
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': ip });
  return ip;
}

export interface PublishedBriefing {
  instructionId: string;
  /** The en questions with the option texts and the index of the right one. */
  questions: { prompt: string; options: string[]; correct: number }[];
}

/** Creates an instruction from the 12-language platform template and publishes it (SF-01). */
export async function publishBriefing(
  request: APIRequestContext,
  side: WorldSide,
): Promise<PublishedBriefing> {
  const admin = {
    Cookie: `rf_session=${side.users.tenant_admin.sessionToken}`,
    Origin: APP_ORIGIN,
  };
  const base = `/api/t/${side.tenantId}/safety`;
  const created = await request.post(`${base}/instructions`, {
    headers: admin,
    data: { name: 'Site rules', allSites: true, siteIds: [] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const instruction = (await created.json()) as { id: string; draft: { id: string } };
  const published = await request.post(`${base}/versions/${instruction.draft.id}/publish`, {
    headers: admin,
    data: { materialChange: false },
  });
  expect(published.status(), await published.text()).toBe(200);
  const detail = await request.get(`${base}/versions/${instruction.draft.id}`, { headers: admin });
  const version = (await detail.json()) as {
    content: { locale: string; questions: PublishedBriefing['questions'] }[];
  };
  const en = version.content.find((c) => c.locale === DriverLocale.en);
  if (!en || en.questions.length === 0) throw new Error('the template has no en quiz');
  return {
    instructionId: instruction.id,
    questions: en.questions.map(({ prompt, options, correct }) => ({ prompt, options, correct })),
  };
}

/** What the gate and the dock do to a booking (U9 builds those screens), as the owner. */
export async function setVisit(
  booking: WorldBooking,
  state: 'checked_in' | 'called',
): Promise<{ dockCode: string; hall: string }> {
  const { rows } = await db().query<{ id: string; code: string; hall: string }>(
    `select d.id, d.code, h.name as hall from dock d join hall h on h.id = d.hall_id
     where d.site_id = $1 order by d.code limit 1`,
    [booking.siteId],
  );
  const dock = rows[0];
  if (!dock) throw new Error('the world site has no dock');
  await db().query(
    state === OnSiteStatus.checked_in
      ? `update booking set status = 'checked_in', checked_in_at = now() where id = $1`
      : `update booking set status = 'called', dock_id = $2, called_at = now(),
           checked_in_at = coalesce(checked_in_at, now()) where id = $1`,
    state === OnSiteStatus.checked_in ? [booking.id] : [booking.id, dock.id],
  );
  return { dockCode: dock.code, hall: dock.hall };
}

/** Row counts that a read-only poll must leave alone (DR-03). */
export async function writeCounts(tenantId: string) {
  const count = async (table: string) => {
    const { rows } = await db().query<{ n: number }>(
      `select count(*)::int as n from ${table} where tenant_id = $1`,
      [tenantId],
    );
    return rows[0]?.n ?? 0;
  };
  return {
    bookingAcknowledgement: await count('booking_acknowledgement'),
    bookingEvent: await count('booking_event'),
    safetyPass: await count('safety_pass'),
  };
}

export async function attemptsOf(bookingId: string): Promise<number> {
  const { rows } = await db().query<{ attempts: number }>(
    'select attempts from safety_attempt where booking_id = $1',
    [bookingId],
  );
  return rows[0]?.attempts ?? 0;
}

export async function revokeLink(booking: WorldBooking): Promise<void> {
  await db().query('update driver_access set revoked_at = now() where id = $1', [
    booking.driverAccessId,
  ]);
}

/** A 30-minute gate-device session (YD-02), as U9's "start briefing here" issues it. */
export async function gateDeviceToken(side: WorldSide, booking: WorldBooking): Promise<string> {
  const id = randomUUID();
  const token = deriveToken(TokenPurpose.driver, id);
  await db().query(
    `insert into driver_access (id, tenant_id, site_id, booking_id, carrier_id, token_hash, channel, expires_at)
     values ($1, $2, $3, $4, $5, $6, 'staff', now() + interval '30 minutes')`,
    [
      id,
      side.tenantId,
      booking.siteId,
      booking.id,
      booking.carrierId,
      createHash('sha256').update(token).digest(),
    ],
  );
  return token;
}

/** Driver names and plates of the seeded avis, which the PWA must never show. */
export async function personalDataOf(booking: WorldBooking): Promise<string[]> {
  const { rows } = await db().query<{ driver_name: string; plate: string }>(
    'select driver_name, plate from avis where booking_id = $1',
    [booking.id],
  );
  return rows.flatMap((r) => [r.driver_name, r.plate]);
}
