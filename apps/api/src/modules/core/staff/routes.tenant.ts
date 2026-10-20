import {
  type InvitationView,
  InviteStaff,
  type MemberList,
  type MemberView,
  type TenantRole,
  UpdateStaff,
} from '@rampflow/shared/modules/core/api.staff';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requirePermission, withinLimit } from '../../../kernel/access.ts';
import { noBody, op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
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
  .get(
    '/',
    op({
      id: 'core.staff.listStaff',
      stories: ['TN-01'],
      description:
        '`{ members: [{ membershipId, userId, name, email, role, siteIds, self }], invitations: [{ id, email, role, siteIds, expiresAt, expired }] }`',
      responses: { 200: type<MemberList<TenantRole>>() },
    }),
    async (c) => {
      const { tenantId, userId } = tenantRequest(c);
      const org_ = { orgId: tenantId, orgKind: 'tenant' as const };
      return c.json(await listMembers<TenantRole>(c.var.db, org_, userId, c.var.clock.now()), 200);
    },
  )
  .post(
    '/invitations',
    op({
      id: 'core.staff.createInvitation',
      stories: ['TN-01'],
      description:
        'The limit `core.max_internal_users` counts members plus pending invitations. `{ email, role, siteIds? }` → 201 invitation. `siteIds` only for gate and dock operators (422 on `["siteIds"]` otherwise, on `["siteIds", i]` for another tenant\'s site). A pending invitation to the same email is replaced and does not count twice; a member\'s email answers 409 `conflict` `already_member`',
      limits: ['core.max_internal_users'],
      responses: { 201: type<InvitationView<TenantRole>>() },
    }),
    validate('json', InviteStaff),
    async (c) => {
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
    },
  )
  .delete(
    '/invitations/:invitationId',
    op({
      id: 'core.staff.deleteInvitation',
      stories: ['TN-01'],
      description: '204, the link stops working',
      responses: { 204: noBody },
    }),
    validate('param', InvitationParam),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const { invitationId } = c.req.valid('param');
      await revokeInvitation(c.var.db, tenantId, invitationId, c.var.clock.now());
      return c.body(null, 204);
    },
  )
  .patch(
    '/:membershipId',
    op({
      id: 'core.staff.updateMember',
      stories: ['TN-01'],
      description:
        '`{ role?, siteIds? }` → the member; a role without a site list drops its `membership_site` rows',
      responses: { 200: type<MemberView<TenantRole>>() },
    }),
    validate('param', MembershipParam),
    validate('json', UpdateStaff),
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
  .delete(
    '/:membershipId',
    op({
      id: 'core.staff.deleteMember',
      stories: ['TN-01'],
      description: "access ends on the member's next request",
      responses: { 204: noBody },
    }),
    validate('param', MembershipParam),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const org_ = { orgId: tenantId, orgKind: 'tenant' as const };
      await removeMember(c.var.db, org_, c.req.valid('param').membershipId);
      return c.body(null, 204);
    },
  );
