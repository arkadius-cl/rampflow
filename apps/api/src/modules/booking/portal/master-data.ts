import type { PortalLoadType, PortalSite } from '@rampflow/shared/modules/booking/api.portal';
import type { TimeZone } from '@rampflow/shared/time';
import { and, asc, eq } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { site } from '../../core/schema.ts';
import { loadType } from '../schema.resources.ts';

// What the booking wizard shows of a tenant (BK-04): its active sites with the rules that shape
// the offers and the avis, and the load types a carrier may book.

/** 404 unless the site is an active site of the tenant. */
export async function requireCarrierSite(tx: Tx, tenantId: TenantId, siteId: SiteId) {
  const [row] = await tx
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.id, siteId), eq(site.tenantId, tenantId), eq(site.active, true)));
  if (!row) throw new ApiError('not_found', 'No such site');
}

export async function carrierSites(
  tx: Tx,
  access: Access,
  tenantId: TenantId,
): Promise<PortalSite[]> {
  const rows = await tx
    .select()
    .from(site)
    .where(and(eq(site.tenantId, tenantId), eq(site.active, true)))
    .orderBy(asc(site.name));
  const items: PortalSite[] = [];
  for (const s of rows) {
    const value = async <K extends Parameters<Access['setting']>[0]>(key: K) =>
      (await access.setting(key, s.id)).value;
    items.push({
      id: s.id,
      name: s.name,
      address: {
        line1: s.addressLine1,
        line2: s.addressLine2,
        postalCode: s.postalCode,
        city: s.city,
        country: s.country,
      },
      phone: s.phone,
      timeZone: s.timeZone as TimeZone,
      cutoffMinutes: await value('booking.cancel_cutoff_minutes'),
      leadMinutes: await value('booking.min_lead_minutes'),
      horizonDays: await value('booking.horizon_days'),
      avisRules: {
        requiredReferenceTypes: await value('avis.required_reference_types'),
        requireGrossWeight: await value('avis.require_gross_weight'),
        requireDriverPhone: await value('avis.require_driver_phone'),
        requirePlate: await value('booking.require_plate'),
      },
    });
  }
  return items;
}

/** Active, carrier-bookable load types of a site, in the tenant's order. */
export async function carrierLoadTypes(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
): Promise<PortalLoadType[]> {
  const rows = await tx
    .select({ id: loadType.id, name: loadType.name, direction: loadType.direction })
    .from(loadType)
    .where(
      and(
        eq(loadType.tenantId, tenantId),
        eq(loadType.siteId, siteId),
        eq(loadType.active, true),
        eq(loadType.carrierBookable, true),
      ),
    )
    .orderBy(asc(loadType.sort), asc(loadType.id));
  return rows.map((r) => ({ ...r, name: r.name as PortalLoadType['name'] }));
}
