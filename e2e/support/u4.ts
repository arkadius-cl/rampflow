import { type BrowserContext, expect } from '@playwright/test';
import pg from 'pg';
import { hoursTemplateRows } from '../../packages/shared/src/modules/core/api.sites.ts';
import { HttpMethod } from '../../packages/shared/src/values/http.ts';
import type { World, WorldSide } from './auth.ts';

// U4 helpers for the sites and capacity specs (MD-01 to MD-05): the world's site fixtures,
// entitlement overrides written as the owner, and API calls with the signed-in user's session.

const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;

/** A site of the world (apps/api/test/world.ts): one hall, docks D-01 and D-02 in "Ramp pool". */
export interface WorldSite {
  id: string;
  hallId: string;
  dockIds: [string, string];
  resourceId: string;
  loadTypeId: string;
}

export const siteOf = (side: WorldSide, n = 0) => side.sites[n] as unknown as WorldSite;

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

/** Overrides one entitlement of a tenant, as a platform admin would (PL-02). */
export async function overrideEntitlement(
  w: World,
  tenantId: string,
  key: string,
  value: boolean | number,
): Promise<void> {
  await db().query(
    `insert into entitlement_override (tenant_id, key, value, updated_by)
     values ($1, $2, $3, $4)
     on conflict (tenant_id, key) do update set value = excluded.value`,
    [tenantId, key, JSON.stringify({ v: value }), w.platformAdmin.id],
  );
}

/** An API call as the context's signed-in user; fails the test on a non-2xx answer. */
export async function apiCall<T>(
  context: BrowserContext,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await context.request.fetch(`/api${path}`, {
    method,
    data,
    headers: { Origin: APP_ORIGIN },
  });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

/**
 * The world's "Ramp pool" starts without docks or load types; this links the site's load type to
 * it and puts D-01 and D-02 into it, since a pool with docks needs an active load type (MD-03).
 */
export async function poolWorldDocks(context: BrowserContext, w: World, n = 0): Promise<void> {
  const s = siteOf(w.A, n);
  await apiCall(
    context,
    HttpMethod.PUT,
    `/t/${w.A.tenantId}/capacity/load-types/${s.loadTypeId}/resources`,
    { resourceIds: [s.resourceId] },
  );
  await apiCall(
    context,
    HttpMethod.PUT,
    `/t/${w.A.tenantId}/capacity/resources/${s.resourceId}/docks`,
    { dockIds: s.dockIds },
  );
}

/** The next Monday after today, as YYYY-MM-DD. */
export function nextMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export const newSiteBody = (name: string) => ({
  name,
  addressLine1: 'Industriestr. 5',
  postalCode: '85748',
  city: 'Garching',
  country: 'DE',
  subdivision: 'DE-BY',
  timeZone: 'Europe/Berlin',
  defaultLocale: 'en',
  hours: hoursTemplateRows.one_shift,
});
