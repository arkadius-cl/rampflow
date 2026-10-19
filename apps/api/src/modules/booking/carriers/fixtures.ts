import { randomBytes, randomUUID } from 'node:crypto';
import type { RegistrationMode } from '@rampflow/shared/modules/booking/api.carriers';
import { and, eq, isNull } from 'drizzle-orm';
import type { OwnerDb } from '../../../../test/db.ts';
import {
  type CarrierId,
  type SiteId,
  type TenantId,
  type UserId,
  wrapJson,
} from '../../../db/ids.ts';
import { deriveToken, tokenHashFor } from '../../../kernel/tokens.ts';
import { settingValue } from '../../core/schema.ts';
import { newSlug } from '../registration/public-links.ts';
import { carrierInvitation, carrierRegistration, publicLink } from '../schema.carriers.ts';

// Carrier network fixtures written as the owner, for tests that start mid-flow.

const DAY = 24 * 3600_000;
export const unique = (label: string) => `${label}-${randomBytes(4).toString('hex')}@carrier.test`;

/** A pending carrier invitation; returns the raw token of its /carrier-invite#<token> link. */
export async function carrierInvitationFor(
  db: OwnerDb,
  o: { tenantId: TenantId; invitedBy: UserId; email?: string; expiresAt?: Date },
) {
  const id = randomUUID();
  const email = o.email ?? unique('invited');
  await db.insert(carrierInvitation).values({
    id: id as never,
    tenantId: o.tenantId,
    companyName: 'Invited Spedition',
    email,
    tokenHash: tokenHashFor('carrier_invitation', id),
    invitedBy: o.invitedBy,
    expiresAt: o.expiresAt ?? new Date(Date.now() + 7 * DAY),
  });
  return { id, email, token: deriveToken('carrier_invitation', id) };
}

/** A registration in `status` (default `pending_email`) with its emailed token. */
export async function registrationFor(
  db: OwnerDb,
  o: {
    tenantId: TenantId;
    siteId: SiteId;
    email?: string;
    status?: 'pending_email' | 'pending_approval';
    carrierId?: CarrierId;
  },
) {
  const id = randomUUID();
  const email = o.email ?? unique('registered');
  await db.insert(carrierRegistration).values({
    id: id as never,
    tenantId: o.tenantId,
    siteId: o.siteId,
    companyName: 'Registered Spedition',
    country: 'LT',
    contactName: 'Rasa Registrant',
    email,
    locale: 'en',
    status: o.status ?? 'pending_email',
    carrierId: o.carrierId ?? null,
    tokenHash: tokenHashFor('registration', id),
    expiresAt: new Date(Date.now() + DAY),
  });
  return { id, email, token: deriveToken('registration', id) };
}

/** Writes one setting value of a site, as TN-02's settings screen would. */
export async function setSiteSetting(
  db: OwnerDb,
  o: { tenantId: TenantId; siteId: SiteId; key: string; value: unknown; by: UserId },
) {
  await db
    .insert(settingValue)
    .values({
      tenantId: o.tenantId,
      siteId: o.siteId,
      key: o.key,
      value: wrapJson(o.value),
      updatedBy: o.by,
    })
    .onConflictDoUpdate({
      target: [settingValue.tenantId, settingValue.siteId, settingValue.key],
      set: { value: wrapJson(o.value) },
    });
}

/** A site's public link, switched on, in `mode`, replacing the site's slug. Returns the slug. */
export async function openLinkFor(
  db: OwnerDb,
  o: { tenantId: TenantId; siteId: SiteId; by: UserId; mode?: RegistrationMode },
): Promise<string> {
  const slug = newSlug();
  await db
    .update(publicLink)
    .set({ revokedAt: new Date() })
    .where(and(eq(publicLink.siteId, o.siteId), isNull(publicLink.revokedAt)));
  await db.insert(publicLink).values({ slug, tenantId: o.tenantId, siteId: o.siteId });
  await setSiteSetting(db, { ...o, key: 'booking.public_link_enabled', value: true });
  await setSiteSetting(db, {
    ...o,
    key: 'booking.public_registration_mode',
    value: o.mode ?? 'approval_required',
  });
  return slug;
}
