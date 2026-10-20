import type { Role } from '@rampflow/shared';
import {
  isSiteLimited,
  type MemberList,
  type MemberView,
} from '@rampflow/shared/modules/core/api.staff';
import { ErrorCode, OrgKind, ZodIssueCode } from '@rampflow/shared/values';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { AnyOrgId, MembershipId, SiteId, TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { userDisplay } from '../../../kernel/users.ts';
import { invitation, membership, membershipSite, site } from '../schema.ts';
import { invitationView, isPending, openInvitations } from './invitations.ts';

// Members and pending invitations of one tenant (TN-01) or carrier (CR-04). Site lists exist for
// tenant gate and dock operators only.

type MembershipRow = typeof membership.$inferSelect;

export interface OrgRef {
  orgId: AnyOrgId;
  orgKind: Exclude<OrgKind, 'platform'>;
}

async function sitesOf(tx: Tx, org: OrgRef, ids: readonly MembershipId[]) {
  const bySite = new Map<string, string[]>();
  if (org.orgKind !== OrgKind.tenant || ids.length === 0) return bySite;
  const rows = await tx
    .select({ membershipId: membershipSite.membershipId, siteId: membershipSite.siteId })
    .from(membershipSite)
    .where(
      and(
        eq(membershipSite.tenantId, org.orgId as TenantId),
        inArray(membershipSite.membershipId, [...ids]),
      ),
    );
  for (const r of rows)
    bySite.set(r.membershipId, [...(bySite.get(r.membershipId) ?? []), r.siteId]);
  return bySite;
}

async function views<R extends string>(
  tx: Tx,
  org: OrgRef,
  rows: readonly MembershipRow[],
  self: UserId | null,
): Promise<MemberView<R>[]> {
  const users = await userDisplay(
    tx,
    rows.map((r) => r.userId),
  );
  const sites = await sitesOf(
    tx,
    org,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    membershipId: r.id,
    userId: r.userId,
    name: users.get(r.userId)?.name ?? '',
    email: users.get(r.userId)?.email ?? '',
    role: r.role as R,
    siteIds: sites.get(r.id) ?? [],
    self: r.userId === self,
  }));
}

export async function listMembers<R extends string>(
  tx: Tx,
  org: OrgRef,
  self: UserId | null,
  now: Date,
): Promise<MemberList<R>> {
  const rows = await tx
    .select()
    .from(membership)
    .where(and(eq(membership.orgId, org.orgId), eq(membership.orgKind, org.orgKind)))
    .orderBy(asc(membership.createdAt));
  const pending = await tx
    .select()
    .from(invitation)
    .where(and(eq(invitation.orgId, org.orgId), isPending))
    .orderBy(asc(invitation.createdAt));
  return {
    members: await views<R>(tx, org, rows, self),
    invitations: pending.map((i) => invitationView<R>(i, now)),
  };
}

/**
 * `core.max_internal_users` counts tenant members plus invitations that still work (TN-01).
 * `exceptEmail` leaves out the pending invitation that a re-invite replaces.
 */
export async function countInternalUsers(
  tx: Tx,
  tenantId: TenantId,
  now: Date,
  exceptEmail?: string,
): Promise<number> {
  const [members] = await tx
    .select({ n: count() })
    .from(membership)
    .where(and(eq(membership.orgId, tenantId), eq(membership.orgKind, 'tenant')));
  const [invited] = await tx
    .select({ n: count() })
    .from(invitation)
    .where(openInvitations(tenantId, now, exceptEmail));
  return (members?.n ?? 0) + (invited?.n ?? 0);
}

/** 422 on `siteIds` unless every id is a site of the tenant. */
export async function requireTenantSites(
  tx: Tx,
  tenantId: TenantId,
  siteIds: readonly string[],
): Promise<SiteId[]> {
  const unique = [...new Set(siteIds)];
  if (unique.length === 0) return [];
  const found = await tx
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.tenantId, tenantId), inArray(site.id, unique as SiteId[])));
  const known = new Set<string>(found.map((r) => r.id));
  const index = siteIds.findIndex((id) => !known.has(id));
  if (index >= 0) {
    throw new ApiError(ErrorCode.validation_failed, 'Invalid json', {
      issues: [{ path: ['siteIds', index], code: ZodIssueCode.custom, message: 'No such site' }],
    });
  }
  return unique as SiteId[];
}

async function requireMembership(tx: Tx, org: OrgRef, id: MembershipId): Promise<MembershipRow> {
  const [row] = await tx
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.id, id),
        eq(membership.orgId, org.orgId),
        eq(membership.orgKind, org.orgKind),
      ),
    );
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

/**
 * Changes a member's role and, for gate and dock operators, the site list. A role without a site
 * list loses its rows. Takes effect on the member's next request (scopes read it per request).
 */
export async function updateMember<R extends string>(
  tx: Tx,
  org: OrgRef,
  id: MembershipId,
  change: { role?: Role; siteIds?: readonly string[] },
  self: UserId | null,
): Promise<MemberView<R>> {
  const current = await requireMembership(tx, org, id);
  const role = change.role ?? (current.role as Role);
  if (change.siteIds && change.siteIds.length > 0 && !isSiteLimited(role)) {
    throw new ApiError(ErrorCode.validation_failed, 'Invalid json', {
      issues: [
        {
          path: ['siteIds'],
          code: ZodIssueCode.custom,
          message: 'Only gate and dock operators have a site list',
        },
      ],
    });
  }
  if (role !== current.role) {
    await tx.update(membership).set({ role }).where(eq(membership.id, id));
  }
  if (org.orgKind === OrgKind.tenant) {
    const tenantId = org.orgId as TenantId;
    const replace = !isSiteLimited(role) ? [] : change.siteIds;
    if (replace !== undefined) {
      const siteIds = await requireTenantSites(tx, tenantId, replace);
      await tx
        .delete(membershipSite)
        .where(and(eq(membershipSite.membershipId, id), eq(membershipSite.tenantId, tenantId)));
      if (siteIds.length > 0) {
        await tx.insert(membershipSite).values(
          siteIds.map((siteId) => ({
            membershipId: id,
            userId: current.userId,
            siteId,
            tenantId,
          })),
        );
      }
    }
  }
  const [view] = await views<R>(tx, org, [{ ...current, role }], self);
  if (!view) throw new Error('member view missing');
  return view;
}

/** Ends the membership. The user's next request to this org answers 404 (TN-01). */
export async function removeMember(tx: Tx, org: OrgRef, id: MembershipId): Promise<void> {
  await tx
    .delete(membership)
    .where(
      and(
        eq(membership.id, id),
        eq(membership.orgId, org.orgId),
        eq(membership.orgKind, org.orgKind),
      ),
    );
}
