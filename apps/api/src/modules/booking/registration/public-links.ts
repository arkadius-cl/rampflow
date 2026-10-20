import { randomBytes } from 'node:crypto';
import type { PublicLinkInfo, PublicLinkView } from '@rampflow/shared/modules/booking/api.carriers';
import { ErrorCode, ScopeParty, Setting } from '@rampflow/shared/values';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import { type Scope, type Tx, withScope } from '../../../db/scope.ts';
import { type Access, loadAccess } from '../../../kernel/access.ts';
import type { Clock } from '../../../kernel/clock.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { currentLogoUrl } from '../../brand/logo/logo.ts';
import { org, site } from '../../core/schema.ts';
import { publicLink } from '../schema.carriers.ts';

// TN-04: one public booking link per site. The slug only names the link; the site setting
// `booking.public_link_enabled` and the feature `booking.public_link` switch it on and off.
// `public_link` has no RLS, so every query here filters by tenant itself.

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
export const SLUG_LENGTH = 10;

/** 10 random base32 characters, 50 bits. */
export function newSlug(): string {
  return [...randomBytes(SLUG_LENGTH)].map((b) => BASE32[b % 32]).join('');
}

async function requireTenantSite(tx: Tx, tenantId: TenantId, siteId: SiteId) {
  const [row] = await tx
    .select({ id: site.id, name: site.name })
    .from(site)
    .where(and(eq(site.id, siteId), eq(site.tenantId, tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

async function activeSlug(tx: Tx, tenantId: TenantId, siteId: SiteId): Promise<string | null> {
  const [row] = await tx
    .select({ slug: publicLink.slug })
    .from(publicLink)
    .where(
      and(
        eq(publicLink.tenantId, tenantId),
        eq(publicLink.siteId, siteId),
        isNull(publicLink.revokedAt),
      ),
    );
  return row?.slug ?? null;
}

async function linkView(
  access: Access,
  s: { id: SiteId; name: string },
  slug: string | null,
): Promise<PublicLinkView> {
  return {
    siteId: s.id,
    siteName: s.name,
    slug,
    enabled: (await access.setting(Setting.booking.public_link_enabled, s.id)).value,
    mode: (await access.setting(Setting.booking.public_registration_mode, s.id)).value,
  };
}

/** Every site of the tenant with its slug, switch and registration mode. */
export async function listPublicLinks(
  tx: Tx,
  tenantId: TenantId,
  access: Access,
): Promise<PublicLinkView[]> {
  const sites = await tx
    .select({ id: site.id, name: site.name })
    .from(site)
    .where(eq(site.tenantId, tenantId))
    .orderBy(asc(site.name));
  const slugs = await tx
    .select({ siteId: publicLink.siteId, slug: publicLink.slug })
    .from(publicLink)
    .where(and(eq(publicLink.tenantId, tenantId), isNull(publicLink.revokedAt)));
  const bySite = new Map(slugs.map((s) => [s.siteId, s.slug]));
  return Promise.all(sites.map((s) => linkView(access, s, bySite.get(s.id) ?? null)));
}

/** The site's slug, created on the first call. `created` tells 201 from 200. */
export async function ensurePublicLink(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
  access: Access,
): Promise<{ view: PublicLinkView; created: boolean }> {
  const s = await requireTenantSite(tx, tenantId, siteId);
  const existing = await activeSlug(tx, tenantId, siteId);
  if (existing) return { view: await linkView(access, s, existing), created: false };
  // A concurrent first call loses the partial unique index on the site and reads the winner.
  const inserted = await tx
    .insert(publicLink)
    .values({ slug: newSlug(), tenantId, siteId })
    .onConflictDoNothing();
  return {
    view: await linkView(access, s, await activeSlug(tx, tenantId, siteId)),
    created: inserted.rowCount === 1,
  };
}

/** Revokes the site's slug and issues a new one, for a link that leaked. The old slug 404s. */
export async function regeneratePublicLink(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
  access: Access,
  now: Date,
): Promise<PublicLinkView> {
  const s = await requireTenantSite(tx, tenantId, siteId);
  await tx
    .update(publicLink)
    .set({ revokedAt: now })
    .where(
      and(
        eq(publicLink.tenantId, tenantId),
        eq(publicLink.siteId, siteId),
        isNull(publicLink.revokedAt),
      ),
    );
  const slug = newSlug();
  await tx.insert(publicLink).values({ slug, tenantId, siteId });
  return linkView(access, s, slug);
}

export interface PublicLinkTarget {
  tenantId: TenantId;
  siteId: SiteId;
}

/** The tenant and site of an unrevoked slug, or 404. Runs before any tenant is known. */
export async function resolveSlug(slug: string): Promise<PublicLinkTarget> {
  const [link] = await withScope({ party: ScopeParty.anonymous }, (tx) =>
    tx
      .select({ tenantId: publicLink.tenantId, siteId: publicLink.siteId })
      .from(publicLink)
      .where(and(eq(publicLink.slug, slug), isNull(publicLink.revokedAt))),
  );
  if (!link) throw new ApiError(ErrorCode.not_found);
  return link;
}

export const publicScope = (link: PublicLinkTarget): Scope => ({
  party: ScopeParty.public,
  ...link,
});

/**
 * 404 unless the link a registration came through still takes registrations: its slug is not
 * revoked (when the registration recorded one) and `openPublicLink` still opens the site.
 * Inside the public scope of `link`.
 */
export async function assertLinkOpen(
  tx: Tx,
  link: PublicLinkTarget,
  slug: string | null,
  clock: Clock,
): Promise<void> {
  if (slug) {
    const [row] = await tx
      .select({ slug: publicLink.slug })
      .from(publicLink)
      .where(
        and(
          eq(publicLink.slug, slug),
          eq(publicLink.tenantId, link.tenantId),
          isNull(publicLink.revokedAt),
        ),
      );
    if (!row) throw new ApiError(ErrorCode.not_found);
  }
  await openPublicLink(tx, link, clock);
}

/**
 * What the registration page shows, inside `withScope(publicScope(link))`. 404 while the
 * feature `booking.public_link` or the site's `booking.public_link_enabled` is off, or the site
 * is inactive: a visitor cannot tell these apart from an unknown slug.
 */
export async function openPublicLink(
  tx: Tx,
  link: PublicLinkTarget,
  clock: Clock,
): Promise<{ info: PublicLinkInfo; access: Access }> {
  const access = await loadAccess(tx, publicScope(link), clock);
  const enabled =
    access.entitlements?.features['booking.public_link'] === true &&
    (await access.setting(Setting.booking.public_link_enabled, link.siteId)).value;
  const [found] = await tx
    .select({ name: site.name, city: site.city, country: site.country, active: site.active })
    .from(site)
    .where(and(eq(site.id, link.siteId), eq(site.tenantId, link.tenantId)));
  const [tenant] = await tx.select({ name: org.name }).from(org).where(eq(org.id, link.tenantId));
  if (!enabled || !found?.active || !tenant || !access.entitlements) {
    throw new ApiError(ErrorCode.not_found);
  }
  return {
    access,
    info: {
      tenantName: tenant.name,
      siteName: found.name,
      city: found.city,
      country: found.country,
      logoUrl: await currentLogoUrl(tx, link.tenantId, access.entitlements, ''),
    },
  };
}
