import { type APIRequestContext, expect } from '@playwright/test';
import pg from 'pg';
import type { World, WorldSide, WorldUser } from './auth.ts';

// Safety fixtures (U5): API calls as a seeded user, and what no staff screen writes: package
// overrides and drivers' acknowledgements (the driver PWA records those, U10).

const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

export interface WorldBooking {
  id: string;
  code: string;
  siteId: string;
  carrierId: string;
}

/** `seedWorld` returns the world's bookings too; auth.ts leaves them out of its type. */
export const bookingsOf = (side: WorldSide) =>
  (side as WorldSide & { bookings: Record<'own' | 'rival' | 'otherSite', WorldBooking> }).bookings;

/** A JSON API call with the user's session, as the browser would send it. */
export async function apiAs<T>(
  request: APIRequestContext,
  user: WorldUser,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(`/api${path}`, {
    method,
    data,
    headers: { Cookie: `rf_session=${user.sessionToken}`, Origin: APP_ORIGIN },
  });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

/** Sets one entitlement of the tenant, as a platform admin's override would. */
export async function overrideEntitlement(
  w: World,
  side: WorldSide,
  key: string,
  value: boolean | number,
): Promise<void> {
  await db().query(
    `insert into entitlement_override (tenant_id, key, value, updated_by)
     values ($1, $2, $3, $4)
     on conflict (tenant_id, key) do update set value = excluded.value`,
    [side.tenantId, key, JSON.stringify({ v: value }), w.platformAdmin.id],
  );
}

/** Creates an all-sites instruction from the template and publishes version 1. */
export async function publishedBriefing(
  request: APIRequestContext,
  side: WorldSide,
  name: string,
): Promise<{ id: string; versionId: string }> {
  const admin = side.users.tenant_admin;
  const base = `/t/${side.tenantId}/safety`;
  const created = await apiAs<{ id: string; draft: { id: string } }>(
    request,
    admin,
    'POST',
    `${base}/instructions`,
    { name, allSites: true, siteIds: [] },
  );
  await apiAs(request, admin, 'POST', `${base}/versions/${created.draft.id}/publish`, {
    materialChange: false,
  });
  return { id: created.id, versionId: created.draft.id };
}

/** A driver's acknowledgement of the published version, as the driver PWA records it (SF-04). */
export async function acknowledge(o: {
  side: WorldSide;
  instructionId: string;
  booking: WorldBooking;
  driverName: string;
  completedAt: Date;
  validDays: number;
  locale?: string;
}): Promise<void> {
  const locale = o.locale ?? 'pl';
  const { rows } = await db().query<{
    version_id: string;
    content_hash: Buffer;
    statement: string;
  }>(
    `select c.version_id, c.content_hash, c.statement from safety_content c
     join safety_version v on v.id = c.version_id
     where v.instruction_id = $1 and v.status = 'published' and c.locale = $2`,
    [o.instructionId, locale],
  );
  const content = rows[0];
  if (!content) throw new Error(`no published ${locale} content`);
  await db().query(
    `insert into safety_acknowledgement (tenant_id, instruction_id, version_id, locale, content_hash,
       booking_id, carrier_id, driver_name, statement_shown, channel, score, attempts, completed_at,
       expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'link', 100, 1, $10, $11)`,
    [
      o.side.tenantId,
      o.instructionId,
      content.version_id,
      locale,
      content.content_hash,
      o.booking.id,
      o.booking.carrierId,
      o.driverName,
      content.statement,
      o.completedAt,
      o.validDays > 0 ? new Date(o.completedAt.getTime() + o.validDays * 86_400_000) : null,
    ],
  );
}
