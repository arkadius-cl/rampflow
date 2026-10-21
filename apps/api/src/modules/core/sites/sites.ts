import type { CreateSite, SiteView, UpdateSite } from '@rampflow/shared/modules/core/api.sites';
import type { TimeZone } from '@rampflow/shared/time';
import { ErrorCode, Limit } from '@rampflow/shared/values';
import { and, asc, count, eq } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { withinLimit } from '../../../kernel/access.ts';
import type { Clock } from '../../../kernel/clock.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { seedLoadTypes } from '../../booking/capacity/load-types.ts';
import { syncHolidays } from '../../booking/jobs/holiday-import.ts';
import { openingHours } from '../../booking/schema.resources.ts';
import { site } from '../schema.ts';
import { invalid, type TenantRequest } from './tenant.ts';

type SiteRow = typeof site.$inferSelect;

export function siteView(row: SiteRow): SiteView {
  return {
    id: row.id,
    name: row.name,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    city: row.city,
    country: row.country,
    subdivision: row.subdivision,
    timeZone: row.timeZone as TimeZone,
    defaultLocale: row.defaultLocale,
    phone: row.phone,
    active: row.active,
  };
}

/** The site, if the tenant has it and the scope allows it (RLS hides other sites); else 404. */
export async function requireSite(tx: Tx, tenantId: TenantId, siteId: SiteId): Promise<SiteRow> {
  const [row] = await tx
    .select()
    .from(site)
    .where(and(eq(site.id, siteId), eq(site.tenantId, tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

export function listSites(tx: Tx, tenantId: TenantId): Promise<SiteRow[]> {
  return tx.select().from(site).where(eq(site.tenantId, tenantId)).orderBy(asc(site.name));
}

export const countActiveSites = (tenantId: TenantId) => async (tx: Tx) => {
  const [row] = await tx
    .select({ n: count() })
    .from(site)
    .where(and(eq(site.tenantId, tenantId), eq(site.active, true)));
  return row?.n ?? 0;
};

/** 422 unless the platform admits sites in the country (`core.site_countries`). */
function requireSiteCountry(country: string, admitted: readonly string[]): void {
  if (!admitted.includes(country)) {
    throw invalid(['country'], 'The platform admits no sites in this country');
  }
}

/** MD-01 and MD-05: a new site gets its weekly hours, the seeded load types and its public holidays. */
export async function createSite(
  tx: Tx,
  req: TenantRequest,
  clock: Clock,
  input: CreateSite,
  admittedCountries: readonly string[],
): Promise<SiteRow> {
  requireSiteCountry(input.country, admittedCountries);
  await withinLimit(
    tx,
    req.tenantId,
    req.entitlements,
    Limit.core.max_sites,
    countActiveSites(req.tenantId),
  );
  const { hours, ...fields } = input;
  const [row] = await tx
    .insert(site)
    .values({ ...fields, tenantId: req.tenantId })
    .returning();
  if (!row) throw new Error('site insert returned nothing');
  await tx
    .insert(openingHours)
    .values(hours.map((h) => ({ tenantId: req.tenantId, siteId: row.id, resourceId: null, ...h })));
  await seedLoadTypes(tx, row);
  await syncHolidays(tx, row, clock.now());
  return row;
}

export async function updateSite(
  tx: Tx,
  req: TenantRequest,
  clock: Clock,
  siteId: SiteId,
  input: UpdateSite,
  admittedCountries: readonly string[],
): Promise<SiteRow> {
  const current = await requireSite(tx, req.tenantId, siteId);
  // A site keeps a country the platform no longer admits until someone changes it.
  if (input.country !== undefined && input.country !== current.country) {
    requireSiteCountry(input.country, admittedCountries);
  }
  const country = input.country ?? current.country;
  const subdivision = input.subdivision === undefined ? current.subdivision : input.subdivision;
  if (subdivision && !subdivision.startsWith(`${country}-`)) {
    throw invalid(['subdivision'], 'The subdivision must belong to the country');
  }
  if (input.active === true && !current.active) {
    await withinLimit(
      tx,
      req.tenantId,
      req.entitlements,
      Limit.core.max_sites,
      countActiveSites(req.tenantId),
    );
  }
  const [row] = await tx
    .update(site)
    .set(input)
    .where(and(eq(site.id, siteId), eq(site.tenantId, req.tenantId)))
    .returning();
  if (!row) throw new ApiError(ErrorCode.not_found);
  if (row.country !== current.country || row.subdivision !== current.subdivision) {
    await syncHolidays(tx, row, clock.now());
  }
  return row;
}
