import { randomUUID } from 'node:crypto';
import type { SignupInspect, SignupVerified } from '@rampflow/shared/modules/core/api.signup';
import { initialTaxIdStatus } from '@rampflow/shared/modules/core/tax-id';
import { SignupStatus } from '@rampflow/shared/modules/core/values';
import {
  ConflictReason,
  ErrorCode,
  OrgKind,
  PackageId,
  Role,
  ScopeParty,
  SystemActorName,
} from '@rampflow/shared/values';
import { and, eq, gt } from 'drizzle-orm';
import { hashToken, type MembershipId, type TenantId, type UserId } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { systemActor } from '../../../kernel/system.ts';
import { accountByEmail } from '../auth/lookup.ts';
import { tenantSignup } from '../schema.signup.ts';
import { appUser, membership, org, tenantSubscription } from '../schema.ts';
import { possibleDuplicate } from './duplicates.redeem.ts';

// RG-02 and RG-04, design decision 9: /signup/verify#<token>. Runs under the token scope of the
// presented token; only the membership is written as the new tenant.

const pendingWhere = (token: string, now: Date) =>
  and(
    eq(tenantSignup.tokenHash, hashToken(token)),
    eq(tenantSignup.status, SignupStatus.pending_email),
    gt(tenantSignup.expiresAt, now),
  );

const invalidLink = () => new ApiError(ErrorCode.unauthorized, 'Invalid or expired link');
const accountExists = () =>
  new ApiError(ErrorCode.conflict, 'An account with this email exists', {
    reason: ConflictReason.account_exists,
  });

async function pendingSignup(tx: Tx, token: string, now: Date) {
  const [row] = await tx.select().from(tenantSignup).where(pendingWhere(token, now));
  if (!row) throw invalidLink();
  return row;
}

/** What the page shows before the click. Does not use the link. */
export async function inspectSignup(tx: Tx, token: string, now: Date): Promise<SignupInspect> {
  const row = await pendingSignup(tx, token, now);
  return {
    email: row.email,
    companyName: row.companyName,
    possibleDuplicate: await possibleDuplicate(tx, row),
  };
}

/**
 * Claims the registration and creates the tenant org, its `start` subscription, the user and
 * the user's `tenant_admin` membership. A used, superseded or expired link answers 401; an
 * account with the email answers 409 `account_exists` and the rollback leaves the row pending.
 */
export async function verifySignup(
  tx: Tx,
  token: string,
  now: Date,
): Promise<SignupVerified & { tenantId: TenantId; userId: UserId }> {
  const row = await pendingSignup(tx, token, now);
  // The loser of a concurrent claim waits for the row lock, then matches nothing: always 401.
  const [claimed] = await tx
    .update(tenantSignup)
    .set({ status: SignupStatus.verified, verifiedAt: now, passwordHash: null })
    .where(and(eq(tenantSignup.id, row.id), pendingWhere(token, now)))
    .returning({ id: tenantSignup.id });
  if (!claimed) throw invalidLink();
  // After the claim on purpose: the loser of a race sees the winner's account only as 401.
  if (await accountByEmail(tx, row.email)) throw accountExists();

  const duplicate = await possibleDuplicate(tx, row);
  const userId = randomUUID() as UserId;
  // The token party reads back only its own user, so the id is generated here.
  const inserted = await tx
    .insert(appUser)
    .values({
      id: userId,
      email: row.email,
      name: `${row.givenName} ${row.familyName}`,
      givenName: row.givenName,
      familyName: row.familyName,
      salutation: row.salutation,
      locale: row.locale,
      passwordHash: row.passwordHash,
      emailVerifiedAt: now,
    })
    .onConflictDoNothing();
  if (inserted.rowCount !== 1) throw accountExists();

  const tenantId = randomUUID() as TenantId;
  await tx.insert(org).values({
    id: tenantId,
    kind: OrgKind.tenant,
    name: row.companyName,
    country: row.country,
    taxIdType: row.taxIdType,
    taxIdValue: row.taxIdValue,
    taxIdStatus: initialTaxIdStatus(row.taxIdType),
    possibleDuplicate: duplicate,
    activatedAt: null,
  });
  await tx
    .insert(tenantSubscription)
    .values({ tenantId, package: PackageId.start, updatedBy: userId, updatedAt: now });
  await asScope(
    tx,
    {
      party: ScopeParty.tenant,
      tenantId,
      siteIds: 'all',
      actor: systemActor(SystemActorName.signup),
    },
    (inner) =>
      inner.insert(membership).values({
        id: randomUUID() as MembershipId,
        userId,
        orgId: tenantId,
        orgKind: OrgKind.tenant,
        role: Role.tenant_admin,
      }),
  );
  await tx.update(tenantSignup).set({ tenantId, userId }).where(eq(tenantSignup.id, row.id));
  return { tenantId, userId, possibleDuplicate: duplicate };
}
