import type { Role } from '@rampflow/shared';
import { MePatchBody, type MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { parseStoredUiPrefs } from '@rampflow/shared/modules/core/ui-prefs';
import { ErrorCode } from '@rampflow/shared/values';
import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { validate } from '../../../kernel/validate.ts';
import { appUser, membership, org } from '../schema.ts';

// Mounted at /api/me under the user scope: the signed-in user, no org chosen (ADR-0002).

const KIND_ORDER = { platform: 0, tenant: 1, carrier: 2 } as const;

async function me(tx: Tx, userId: UserId): Promise<MeResponse> {
  const [row] = await tx
    .select({
      id: appUser.id,
      name: appUser.name,
      email: appUser.email,
      locale: appUser.locale,
      uiPrefs: appUser.uiPrefs,
    })
    .from(appUser)
    .where(eq(appUser.id, userId));
  if (!row) throw new ApiError(ErrorCode.unauthorized);
  const { uiPrefs, ...user } = row;
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
  return { user, memberships, uiPrefs: parseStoredUiPrefs(uiPrefs) };
}

const userOf = (scope: AppEnv['Variables']['scope']): UserId => {
  if (scope.party !== 'user') throw new Error('/api/me runs under the user scope');
  return scope.userId;
};

export const user = new Hono<AppEnv>()
  .get(
    '/',
    op({
      id: 'core.me.getMe',
      stories: [],
      description:
        '`{ user, memberships, uiPrefs }` for the org picker and the stored UI state ([Module contract](module-contract.md#context-endpoints), [ADR-0014](../decisions/ADR-0014-user-ui-preferences.md))',
      responses: {},
    }),
    async (c) => c.json(await me(c.var.db, userOf(c.var.scope)), 200),
  )
  .patch(
    '/',
    op({
      id: 'core.me.updateMe',
      stories: [],
      description:
        '`{ name?, locale?, uiPrefs? }`; `uiPrefs` merges key by key into the stored object; answers like GET',
      responses: {},
    }),
    validate('json', MePatchBody),
    async (c) => {
      const userId = userOf(c.var.scope);
      const { uiPrefs, ...patch } = c.req.valid('json');
      // Per-key merge: a write from one browser keeps the keys another browser wrote.
      const set = uiPrefs
        ? { ...patch, uiPrefs: sql`${appUser.uiPrefs} || ${JSON.stringify(uiPrefs)}::jsonb` }
        : patch;
      if (Object.keys(set).length > 0) {
        await c.var.db.update(appUser).set(set).where(eq(appUser.id, userId));
      }
      return c.json(await me(c.var.db, userId), 200);
    },
  );
