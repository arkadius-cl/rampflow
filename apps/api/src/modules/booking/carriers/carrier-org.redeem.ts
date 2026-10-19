import { randomUUID } from 'node:crypto';
import type { StaffLocale } from '@rampflow/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { CarrierId, MembershipId, TenantId, UserId } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { systemActor } from '../../../kernel/system.ts';
import { accountByEmail } from '../../core/auth/lookup.ts';
import { hashPassword } from '../../core/auth/password.ts';
import { appUser, membership, org } from '../../core/schema.ts';
import { linkCarrier } from './links.ts';

// The steps a carrier invitation (CR-01) and a registration (CR-02) share. Both run in one
// transaction under the token scope of the emailed token (ADR-0002, "Token redemption is one
// transaction") and switch scope only to write what the token party cannot.

const signInRequired = () =>
  new ApiError('unauthorized', 'Sign in to continue', { reason: 'sign_in_required' });

export interface NewAccount {
  name: string;
  password: string | null;
  locale: StaffLocale | null;
}

/**
 * The user who redeems a token for `email`: the signed-in user when that is their email, else a
 * new verified account from `newAccount()`, which may throw 422 for missing fields. An email with
 * an account but no matching session answers 401 `sign_in_required`; the page signs in and
 * posts the token again.
 */
export async function redeemingUser(
  tx: Tx,
  o: {
    email: string;
    signedIn: UserId | null;
    now: Date;
    newAccount: () => NewAccount;
  },
): Promise<UserId> {
  if (o.signedIn) {
    const [me] = await tx
      .select({ email: appUser.email })
      .from(appUser)
      .where(eq(appUser.id, o.signedIn));
    if (me?.email.toLowerCase() === o.email.toLowerCase()) return o.signedIn;
  }
  if (await accountByEmail(tx, o.email)) throw signInRequired();
  const account = o.newAccount();
  const id = randomUUID() as UserId;
  // The token party inserts users but reads back only its own, so the id is generated here; a
  // concurrent redemption for the same email loses the unique index quietly.
  const inserted = await tx
    .insert(appUser)
    .values({
      id,
      email: o.email,
      name: account.name,
      locale: account.locale,
      passwordHash: account.password ? await hashPassword(account.password) : null,
      emailVerifiedAt: o.now,
    })
    .onConflictDoNothing();
  if (inserted.rowCount !== 1) throw signInRequired();
  return id;
}

/**
 * The carrier org the user acts for: an existing carrier membership links that org (TN-03,
 * CR-02), preferring one where the user is carrier admin; otherwise a new company with the user
 * as its carrier admin.
 */
export async function carrierOfUser(
  tx: Tx,
  userId: UserId,
  company: { name: string; country: string | null },
): Promise<CarrierId> {
  const memberships = await asScope(tx, { party: 'user', userId }, (inner) =>
    inner
      .select({ orgId: membership.orgId, role: membership.role })
      .from(membership)
      .where(and(eq(membership.userId, userId), eq(membership.orgKind, 'carrier')))
      .orderBy(asc(membership.createdAt)),
  );
  const existing = memberships.find((m) => m.role === 'carrier_admin') ?? memberships[0];
  if (existing) return existing.orgId as CarrierId;

  const carrierId = randomUUID() as CarrierId;
  await tx
    .insert(org)
    .values({ id: carrierId, kind: 'carrier', name: company.name, country: company.country });
  await asScope(
    tx,
    { party: 'carrier', carrierId, userId, role: 'carrier_admin' },
    async (inner) => {
      await inner.insert(membership).values({
        id: randomUUID() as MembershipId,
        userId,
        orgId: carrierId,
        orgKind: 'carrier',
        role: 'carrier_admin',
      });
    },
  );
  return carrierId;
}

/** Writes the link as the tenant, with a system actor named after the token kind. */
export function linkAsTenant(
  tx: Tx,
  job: 'carrier_invitation' | 'registration',
  o: Parameters<typeof linkCarrier>[1] & { tenantId: TenantId },
): Promise<void> {
  return asScope(
    tx,
    { party: 'tenant', tenantId: o.tenantId, siteIds: 'all', actor: systemActor(job) },
    (inner) => linkCarrier(inner, o),
  );
}

/** The tenant's name, read as the tenant: the token party sees no org. */
export async function tenantName(
  tx: Tx,
  job: 'carrier_invitation' | 'registration',
  tenantId: TenantId,
): Promise<string> {
  const [row] = await asScope(
    tx,
    { party: 'tenant', tenantId, siteIds: 'all', actor: systemActor(job) },
    (inner) => inner.select({ name: org.name }).from(org).where(eq(org.id, tenantId)),
  );
  return row?.name ?? '';
}
