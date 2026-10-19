import { zValidator } from '@hono/zod-validator';
import type { Role } from '@rampflow/shared';
import { MePatchBody, type MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { appUser, membership, org } from '../schema.ts';

// Mounted at /api/me under the user scope: the signed-in user, no org chosen (ADR-0002).

const KIND_ORDER = { platform: 0, tenant: 1, carrier: 2 } as const;

async function me(tx: Tx, userId: UserId): Promise<MeResponse> {
  const [user] = await tx
    .select({ id: appUser.id, name: appUser.name, email: appUser.email, locale: appUser.locale })
    .from(appUser)
    .where(eq(appUser.id, userId));
  if (!user) throw new ApiError('unauthorized');
  const rows = await tx
    .select({
      orgId: membership.orgId,
      orgKind: org.kind,
      orgName: org.name,
      role: membership.role,
    })
    .from(membership)
    .innerJoin(org, eq(org.id, membership.orgId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(org.name));
  const memberships = rows
    .map((m) => ({ ...m, role: m.role as Role }))
    .sort((a, b) => KIND_ORDER[a.orgKind] - KIND_ORDER[b.orgKind]);
  return { user, memberships };
}

const userOf = (scope: AppEnv['Variables']['scope']): UserId => {
  if (scope.party !== 'user') throw new Error('/api/me runs under the user scope');
  return scope.userId;
};

export const user = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await me(c.var.db, userOf(c.var.scope)), 200))
  .patch('/', zValidator('json', MePatchBody, onInvalid), async (c) => {
    const userId = userOf(c.var.scope);
    const patch = c.req.valid('json');
    if (Object.keys(patch).length > 0) {
      await c.var.db.update(appUser).set(patch).where(eq(appUser.id, userId));
    }
    return c.json(await me(c.var.db, userId), 200);
  });
