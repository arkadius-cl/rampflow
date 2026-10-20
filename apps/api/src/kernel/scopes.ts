import {
  ErrorCode,
  OrgKind,
  ScopeParty,
  SiteLimitedRole,
  TenantActorKind,
  values,
} from '@rampflow/shared/values';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import * as z from 'zod';
import {
  type AnyOrgId,
  type CarrierId,
  hashToken,
  type SiteId,
  type TenantId,
  type UserId,
} from '../db/ids.ts';
import { asScope, type CarrierRole, type Scope, type TenantRole, withScope } from '../db/scope.ts';
import {
  appUser,
  membership,
  membershipSite,
  session,
  tenantCarrierLink,
} from '../modules/core/schema.ts';
import { driverAccess } from '../modules/driver/schema.ts';
import type { AppEnv } from './env.ts';
import { ApiError } from './errors.ts';
import type { ScopeResolver } from './scoped.ts';

export const SESSION_COOKIE = 'rf_session';
export const DRIVER_COOKIE = 'rf_driver';
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 5 * 60 * 1000;

const siteLimitedRoles: ReadonlySet<TenantRole> = new Set(values(SiteLimitedRole));
const uuid = z.uuid();

/** The signed-in user of the `rf_session` cookie, or `null`. Touches `last_seen_at` every 5 min. */
export async function sessionUser(c: Context<AppEnv>): Promise<UserId | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const id = hashToken(token);
  const now = c.var.clock.now();
  return withScope({ party: ScopeParty.anonymous }, async (tx) => {
    const [row] = await tx
      .select({
        userId: session.userId,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
      })
      .from(session)
      .where(eq(session.id, id));
    if (!row) return null;
    const idle = now.getTime() - row.lastSeenAt.getTime();
    if (row.expiresAt <= now || idle >= SESSION_IDLE_MS) return null;
    const { userId } = row;
    const [user] = await asScope(tx, { party: ScopeParty.user, userId }, () =>
      tx.select({ disabledAt: appUser.disabledAt }).from(appUser).where(eq(appUser.id, userId)),
    );
    if (!user || user.disabledAt) return null;
    if (idle >= SESSION_TOUCH_MS) {
      await tx.update(session).set({ lastSeenAt: now }).where(eq(session.id, id));
    }
    return userId;
  });
}

async function requireUser(c: Context<AppEnv>): Promise<UserId> {
  const userId = await sessionUser(c);
  if (!userId) throw new ApiError(ErrorCode.unauthorized);
  return userId;
}

/** A path id that is not a UUID is an unknown id: 404, never a database error. */
function pathId<T extends string>(c: Context<AppEnv>, name: string): T {
  const parsed = uuid.safeParse(c.req.param(name));
  if (!parsed.success) throw new ApiError(ErrorCode.not_found);
  return parsed.data as T;
}

async function membershipIn(userId: UserId, orgId: AnyOrgId, kind: OrgKind) {
  return withScope({ party: ScopeParty.user, userId }, async (tx) => {
    const [row] = await tx
      .select({ id: membership.id, role: membership.role })
      .from(membership)
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.orgId, orgId),
          eq(membership.orgKind, kind),
        ),
      );
    if (!row) return null;
    const sites = await tx
      .select({ siteId: membershipSite.siteId })
      .from(membershipSite)
      .where(eq(membershipSite.membershipId, row.id));
    return { role: row.role, siteIds: sites.map((s) => s.siteId) };
  });
}

export const anonymousScope: ScopeResolver = async () => ({ party: ScopeParty.anonymous });

export const userScope: ScopeResolver = async (c) => ({
  party: ScopeParty.user,
  userId: await requireUser(c),
});

export const platformScope: ScopeResolver = async (c) => {
  const userId = await requireUser(c);
  const found = await withScope({ party: ScopeParty.user, userId }, (tx) =>
    tx
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.userId, userId), eq(membership.orgKind, 'platform'))),
  );
  if (!found.some((m) => m.role === 'platform_admin')) throw new ApiError(ErrorCode.not_found);
  return { party: ScopeParty.platform, userId };
};

/**
 * `/t/:orgId`. Gate and dock operators carry their `membership_site` list; an operator without
 * rows, like every other role, sees all sites.
 */
export const tenantScope: ScopeResolver = async (c) => {
  const userId = await requireUser(c);
  const tenantId = pathId<TenantId>(c, 'orgId');
  const m = await membershipIn(userId, tenantId, OrgKind.tenant);
  if (!m) throw new ApiError(ErrorCode.not_found);
  const role = m.role as TenantRole;
  const limited = siteLimitedRoles.has(role) && m.siteIds.length > 0;
  return {
    party: ScopeParty.tenant,
    tenantId,
    siteIds: limited ? (m.siteIds as SiteId[]) : 'all',
    actor: { kind: TenantActorKind.user, userId, role },
  };
};

const AT_TENANT = /^\/api\/c\/[^/]+\/at\/([^/]+)(?:\/|$)/;

/** `/c/:orgId`, or `carrier_at_tenant` under `/c/:orgId/at/:tenantId` when a link exists. */
export const carrierScope: ScopeResolver = async (c) => {
  const userId = await requireUser(c);
  const carrierId = pathId<CarrierId>(c, 'orgId');
  const m = await membershipIn(userId, carrierId, OrgKind.carrier);
  if (!m) throw new ApiError(ErrorCode.not_found);
  const role = m.role as CarrierRole;
  const atTenant = AT_TENANT.exec(c.req.path)?.[1];
  if (atTenant === undefined) return { party: ScopeParty.carrier, carrierId, userId, role };

  const parsed = uuid.safeParse(atTenant);
  if (!parsed.success) throw new ApiError(ErrorCode.not_found);
  const tenantId = parsed.data as TenantId;
  const carrier: Scope = { party: ScopeParty.carrier, carrierId, userId, role };
  const [link] = await withScope(carrier, (tx) =>
    tx
      .select({ status: tenantCarrierLink.status })
      .from(tenantCarrierLink)
      .where(
        and(eq(tenantCarrierLink.tenantId, tenantId), eq(tenantCarrierLink.carrierId, carrierId)),
      ),
  );
  if (!link) throw new ApiError(ErrorCode.not_found);
  return { party: ScopeParty.carrier_at_tenant, carrierId, tenantId, userId, role };
};

/** `/api/driver/*`: the `rf_driver` cookie names an unrevoked, unexpired `driver_access` row. */
export const driverScope: ScopeResolver = async (c) => {
  const token = getCookie(c, DRIVER_COOKIE);
  if (!token) throw new ApiError(ErrorCode.unauthorized);
  const now = c.var.clock.now();
  const [access] = await withScope(tokenScope(token, null), (tx) =>
    tx
      .select({
        tenantId: driverAccess.tenantId,
        bookingId: driverAccess.bookingId,
        channel: driverAccess.channel,
      })
      .from(driverAccess)
      .where(
        and(
          eq(driverAccess.tokenHash, hashToken(token)),
          isNull(driverAccess.revokedAt),
          gt(driverAccess.expiresAt, now),
        ),
      ),
  );
  if (!access) throw new ApiError(ErrorCode.unauthorized);
  return { party: ScopeParty.driver, ...access };
};

/**
 * The holder of an emailed token: sees only rows whose `token_hash` matches. `userId` is the
 * signed-in user accepting an invitation, if any.
 */
export function tokenScope(token: string, userId: UserId | null): Scope {
  return { party: ScopeParty.token, tokenHash: hashToken(token), userId };
}
