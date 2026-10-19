import { zValidator } from '@hono/zod-validator';
import { InviteStaff, type TenantRole, UpdateStaff } from '@rampflow/shared/modules/core/api.staff';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requirePermission, withinLimit } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { org } from '../schema.ts';
import { tenantRequest } from '../sites/tenant.ts';
import { invitationView, issueInvitation, revokeInvitation } from './invitations.ts';
import {
  countInternalUsers,
  listMembers,
  removeMember,
  requireTenantSites,
  updateMember,
} from './members.ts';

const InvitationParam = z.object({ invitationId: idSchema<'invitation'>() });
const MembershipParam = z.object({ membershipId: idSchema<'membership'>() });

/** Mounted at `/api/t/:orgId/staff` by modules/index.ts (TN-01). */
export const tenant = new Hono<AppEnv>()
  .use(requirePermission('core.manage_staff'))
  .get('/', async (c) => {
    const { tenantId, userId } = tenantRequest(c);
    const org_ = { orgId: tenantId, orgKind: 'tenant' as const };
    return c.json(await listMembers<TenantRole>(c.var.db, org_, userId, c.var.clock.now()), 200);
  })
  .post('/invitations', zValidator('json', InviteStaff, onInvalid), async (c) => {
    const req = tenantRequest(c);
    const tx = c.var.db;
    const now = c.var.clock.now();
    const input = c.req.valid('json');
    const siteIds = await requireTenantSites(tx, req.tenantId, input.siteIds);
    await withinLimit(tx, req.tenantId, req.entitlements, 'core.max_internal_users', (inner) =>
      countInternalUsers(inner, req.tenantId, now, input.email),
    );
    const [named] = await tx.select({ name: org.name }).from(org).where(eq(org.id, req.tenantId));
    const locale = await c.var.access.setting('i18n.default_locale', null);
    const row = await issueInvitation(
      tx,
      {
        orgId: req.tenantId,
        orgKind: 'tenant',
        orgName: named?.name ?? '',
        email: input.email,
        role: input.role,
        siteIds,
        invitedBy: req.userId,
        locale: locale.value,
      },
      now,
    );
    return c.json(invitationView<TenantRole>(row, now), 201);
  })
  .delete(
    '/invitations/:invitationId',
    zValidator('param', InvitationParam, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const { invitationId } = c.req.valid('param');
      await revokeInvitation(c.var.db, tenantId, invitationId, c.var.clock.now());
      return c.body(null, 204);
    },
  )
  .patch(
    '/:membershipId',
    zValidator('param', MembershipParam, onInvalid),
    zValidator('json', UpdateStaff, onInvalid),
    async (c) => {
      const { tenantId, userId } = tenantRequest(c);
      const view = await updateMember<TenantRole>(
        c.var.db,
        { orgId: tenantId, orgKind: 'tenant' },
        c.req.valid('param').membershipId,
        c.req.valid('json'),
        userId,
      );
      return c.json(view, 200);
    },
  )
  .delete('/:membershipId', zValidator('param', MembershipParam, onInvalid), async (c) => {
    const { tenantId } = tenantRequest(c);
    const org_ = { orgId: tenantId, orgKind: 'tenant' as const };
    await removeMember(c.var.db, org_, c.req.valid('param').membershipId);
    return c.body(null, 204);
  });
