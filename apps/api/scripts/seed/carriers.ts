import { OrgKind } from '@rampflow/shared/values';
import { and, asc, eq, ilike, isNull } from 'drizzle-orm';
import {
  type CarrierId,
  type SiteId,
  type TenantId,
  type UserId,
  wrapJson,
} from '../../src/db/ids.ts';
import { publicLink } from '../../src/modules/booking/schema.carriers.ts';
import {
  appUser,
  org,
  settingValue,
  site,
  tenantCarrierLink,
} from '../../src/modules/core/schema.ts';
import { findOrg, type SeedContext } from './context.ts';
import { ACME, TRANS_POL } from './core.ts';

// The carrier network of the demo tenant: Trans-Pol (from the core seed) and Baltic Freight UAB
// linked to Acme, and a switched-on public booking link for Acme's Hamburg site when that site
// exists (the sites seed creates Hamburg DC first). Converges on every run.

export const BALTIC = 'Baltic Freight UAB';
/** The demo link /r/acmehambrg; a fixed slug so the docs can name it. */
export const ACME_HAMBURG_SLUG = 'acmehambrg';

async function ensureCarrier(ctx: SeedContext, name: string, country: string) {
  const found = await findOrg(ctx.db, OrgKind.carrier, name);
  if (found) return found as CarrierId;
  const [row] = await ctx.db
    .insert(org)
    .values({ kind: 'carrier', name, country })
    .returning({ id: org.id });
  ctx.log(`created carrier ${name}`);
  return row?.id as CarrierId;
}

async function linkActive(ctx: SeedContext, tenantId: TenantId, carrierId: CarrierId) {
  await ctx.db
    .insert(tenantCarrierLink)
    .values({ tenantId, carrierId, status: 'active', source: 'invitation' })
    .onConflictDoUpdate({
      target: [tenantCarrierLink.tenantId, tenantCarrierLink.carrierId],
      set: { status: 'active', deactivatedAt: null },
    });
}

async function hamburgLink(ctx: SeedContext, tenantId: TenantId) {
  const [hamburg] = await ctx.db
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.tenantId, tenantId), ilike(site.name, '%Hamburg%')))
    .orderBy(asc(site.createdAt))
    .limit(1);
  if (!hamburg) {
    ctx.log('no Acme Hamburg site yet; public link skipped');
    return;
  }
  const siteId = hamburg.id as SiteId;
  const [active] = await ctx.db
    .select({ slug: publicLink.slug })
    .from(publicLink)
    .where(and(eq(publicLink.siteId, siteId), isNull(publicLink.revokedAt)));
  if (!active) {
    await ctx.db
      .insert(publicLink)
      .values({ slug: ACME_HAMBURG_SLUG, tenantId, siteId })
      .onConflictDoNothing();
  }
  const [admin] = await ctx.db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, 'admin@rampflow.local'));
  await ctx.db
    .insert(settingValue)
    .values({
      tenantId,
      siteId,
      key: 'booking.public_link_enabled',
      value: wrapJson(true),
      updatedBy: admin?.id as UserId,
    })
    .onConflictDoUpdate({
      target: [settingValue.tenantId, settingValue.siteId, settingValue.key],
      set: { value: wrapJson(true) },
    });
  ctx.log(`public link /r/${active?.slug ?? ACME_HAMBURG_SLUG} is on`);
}

export async function seed(ctx: SeedContext): Promise<void> {
  const acme = (await findOrg(ctx.db, OrgKind.tenant, ACME)) as TenantId | null;
  const transPol = await findOrg(ctx.db, OrgKind.carrier, TRANS_POL);
  if (!acme || !transPol) throw new Error('run the core seed first');
  await linkActive(ctx, acme, transPol as CarrierId);
  await linkActive(ctx, acme, await ensureCarrier(ctx, BALTIC, 'LT'));
  await hamburgLink(ctx, acme);
}
