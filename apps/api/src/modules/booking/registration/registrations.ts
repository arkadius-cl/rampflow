import { randomUUID } from 'node:crypto';
import type { Entitlements, StaffLocale } from '@rampflow/shared';
import type {
  PublicLinkInfo,
  RegistrationBody,
  RegistrationView,
} from '@rampflow/shared/modules/booking/api.carriers';
import { and, desc, eq } from 'drizzle-orm';
import type { CarrierId, SiteId, TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import { consumeRateLimit } from '../../../kernel/rate-limit.ts';
import { tokenHashFor } from '../../../kernel/tokens.ts';
import { accountByEmail } from '../../core/auth/lookup.ts';
import { org, site } from '../../core/schema.ts';
import { linkCarrier } from '../carriers/links.ts';
import { carrierRegistration, REGISTRATION_TOKEN_MS } from '../schema.carriers.ts';
import type { PublicLinkTarget } from './public-links.ts';

// CR-02 and TN-04: a carrier registers through a site's public link, verifies its email
// (verify.redeem.ts), and the tenant approves or rejects when the mode asks for it.

type RegistrationRow = typeof carrierRegistration.$inferSelect;
type RegistrationId = RegistrationRow['id'];

async function withinLimit(
  bucket: 'registration_request' | 'registration_ip',
  key: string,
  now: Date,
): Promise<boolean> {
  try {
    await consumeRateLimit(bucket, key, now);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'rate_limited') return false;
    throw e;
  }
}

/**
 * 5 registrations per hour per email and 100 per client address. Over a limit the route still
 * answers 202 and writes nothing. Commits on its own connection, so call it outside any
 * transaction: holding one connection while waiting for another can exhaust the pool.
 */
export async function registrationAllowed(email: string, ip: string, now: Date) {
  return (
    (await withinLimit('registration_ip', ip, now)) &&
    (await withinLimit('registration_request', email.toLowerCase(), now))
  );
}

/**
 * Records the registration and emails its link, under the public scope of the slug. A known
 * email gets a sign-in prompt instead of the verification text; both carry the same single-use
 * link, which attaches the request to the existing org after sign-in. The caller always answers
 * 202, so the response never reveals an account.
 */
export async function submitRegistration(
  tx: Tx,
  o: {
    link: PublicLinkTarget;
    info: PublicLinkInfo;
    body: RegistrationBody;
    entitlements: Entitlements | null;
    now: Date;
  },
): Promise<void> {
  const { link, body, now } = o;
  const id = randomUUID() as RegistrationId;
  // The public party may insert but not read registrations, so the id is generated here.
  await tx.insert(carrierRegistration).values({
    id,
    tenantId: link.tenantId,
    siteId: link.siteId,
    companyName: body.companyName,
    country: body.country,
    contactName: body.contactName,
    email: body.email,
    locale: body.locale ?? null,
    status: 'pending_email',
    tokenHash: tokenHashFor('registration', id),
    expiresAt: new Date(now.getTime() + REGISTRATION_TOKEN_MS),
  });
  await enqueueEmail(
    tx,
    {
      template: 'booking.registration-verify',
      to: body.email,
      locale: body.locale ?? 'en',
      tenantId: link.tenantId,
      payload: {
        registrationId: id,
        tenantName: o.info.tenantName,
        siteName: o.info.siteName,
        knownAccount: (await accountByEmail(tx, body.email)) !== null,
      },
    },
    o.entitlements,
  );
}

function view(
  row: RegistrationRow,
  siteName: string,
  carrierName: string | null,
): RegistrationView {
  return {
    id: row.id,
    siteId: row.siteId,
    siteName,
    companyName: row.companyName,
    carrierName,
    country: row.country,
    contactName: row.contactName,
    email: row.email,
    status: row.status,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

/** Every registration of the tenant, newest first, with its site's and its carrier org's name. */
export async function listRegistrations(tx: Tx, tenantId: TenantId): Promise<RegistrationView[]> {
  const rows = await tx
    .select({ registration: carrierRegistration, siteName: site.name, carrierName: org.name })
    .from(carrierRegistration)
    .innerJoin(site, eq(site.id, carrierRegistration.siteId))
    .leftJoin(org, eq(org.id, carrierRegistration.carrierId))
    .where(eq(carrierRegistration.tenantId, tenantId))
    .orderBy(desc(carrierRegistration.createdAt));
  return rows.map((r) => view(r.registration, r.siteName, r.carrierName));
}

type Decision = { status: 'approved' } | { status: 'rejected'; reason: string };

/**
 * TN-04: approving links the carrier (reactivating a deactivated link, since the tenant decides)
 * and emails it; rejecting emails the reason. Only a `pending_approval` registration can be
 * decided; any other answers 409 `invalid_transition` with its status.
 */
export async function decideRegistration(
  tx: Tx,
  o: {
    tenantId: TenantId;
    registrationId: RegistrationId;
    decision: Decision;
    decidedBy: UserId | null;
    entitlements: Entitlements;
    now: Date;
  },
): Promise<RegistrationView> {
  const { tenantId, registrationId, decision, now } = o;
  const where = and(
    eq(carrierRegistration.id, registrationId),
    eq(carrierRegistration.tenantId, tenantId),
  );
  const [current] = await tx.select().from(carrierRegistration).where(where);
  if (!current) throw new ApiError('not_found');
  const [row] = await tx
    .update(carrierRegistration)
    .set({
      status: decision.status,
      rejectReason: decision.status === 'rejected' ? decision.reason : null,
      decidedAt: now,
      decidedBy: o.decidedBy,
    })
    .where(and(where, eq(carrierRegistration.status, 'pending_approval')))
    .returning();
  if (!row) {
    throw new ApiError('conflict', `Registration is ${current.status}`, {
      reason: 'invalid_transition',
      status: current.status,
    });
  }
  const carrierId = row.carrierId as CarrierId;
  if (decision.status === 'approved') {
    await linkCarrier(tx, {
      tenantId,
      carrierId,
      source: 'public_link',
      reactivateDeactivatedBefore: now,
    });
  }

  const [tenant] = await tx.select({ name: org.name }).from(org).where(eq(org.id, tenantId));
  const [carrier] = await tx.select({ name: org.name }).from(org).where(eq(org.id, carrierId));
  const carrierName = carrier?.name ?? row.companyName;
  const [s] = await tx
    .select({ name: site.name })
    .from(site)
    .where(eq(site.id, row.siteId as SiteId));
  const common = {
    registrationId: row.id,
    tenantName: tenant?.name ?? '',
    siteName: s?.name ?? '',
  };
  const email = {
    to: row.email,
    locale: (row.locale as StaffLocale | null) ?? 'en',
    tenantId,
  };
  if (decision.status === 'approved') {
    await enqueueEmail(
      tx,
      {
        ...email,
        template: 'booking.registration-approved',
        payload: { ...common, carrierId, carrierName },
      },
      o.entitlements,
    );
  } else {
    await enqueueEmail(
      tx,
      {
        ...email,
        template: 'booking.registration-rejected',
        payload: { ...common, reason: decision.reason },
      },
      o.entitlements,
    );
  }
  return view(row, s?.name ?? '', carrierName);
}
