import {
  type CarrierRole,
  type InvitationView,
  InviteCarrierUser,
  type MemberList,
  type MemberView,
  UpdateCarrierUser,
} from '@rampflow/shared/modules/core/api.staff';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import { noBody, op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
import { appUser, org } from '../schema.ts';
import { invitationView, issueInvitation, revokeInvitation } from '../staff/invitations.ts';
import { listMembers, type OrgRef, removeMember, updateMember } from '../staff/members.ts';

const InvitationParam = z.object({ invitationId: idSchema<'invitation'>() });
const MembershipParam = z.object({ membershipId: idSchema<'membership'>() });

function carrierRequest(c: Context<AppEnv>) {
  const { scope } = c.var;
  if (scope.party !== 'carrier') throw new Error(`carrier route under party ${scope.party}`);
  const org_: OrgRef = { orgId: scope.carrierId, orgKind: 'carrier' };
  return { org: org_, userId: scope.userId };
}

/** Mounted at `/api/c/:orgId/users` by modules/index.ts (CR-04). */
export const carrier = new Hono<AppEnv>()
  .use(requirePermission('core.manage_carrier_users'))
  .get(
    '/',
    op({
      id: 'core.carrier-users.listUsers',
      stories: ['CR-04'],
      description: 'as the staff list, without site lists',
      responses: { 200: type<MemberList<CarrierRole>>() },
    }),
    async (c) => {
      const { org: org_, userId } = carrierRequest(c);
      return c.json(await listMembers<CarrierRole>(c.var.db, org_, userId, c.var.clock.now()), 200);
    },
  )
  .post(
    '/invitations',
    op({
      id: 'core.carrier-users.createInvitation',
      stories: ['CR-04'],
      description: "`{ email, role }` → 201; the email goes out in the inviter's locale",
      responses: { 201: type<InvitationView<CarrierRole>>() },
    }),
    validate('json', InviteCarrierUser),
    async (c) => {
      const { org: org_, userId } = carrierRequest(c);
      const tx = c.var.db;
      const now = c.var.clock.now();
      const input = c.req.valid('json');
      const [named] = await tx.select({ name: org.name }).from(org).where(eq(org.id, org_.orgId));
      const [me] = await tx
        .select({ locale: appUser.locale })
        .from(appUser)
        .where(eq(appUser.id, userId));
      const row = await issueInvitation(
        tx,
        {
          ...org_,
          orgName: named?.name ?? '',
          email: input.email,
          role: input.role,
          invitedBy: userId,
          // A carrier has no default locale; colleagues likely share the inviter's language.
          locale: me?.locale ?? (await c.var.access.setting('i18n.default_locale', null)).value,
        },
        now,
      );
      return c.json(invitationView<CarrierRole>(row, now), 201);
    },
  )
  .delete(
    '/invitations/:invitationId',
    op({
      id: 'core.carrier-users.deleteInvitation',
      stories: ['CR-04'],
      description: 'Revokes an invitation; the link stops working.',
      responses: { 204: noBody },
    }),
    validate('param', InvitationParam),
    async (c) => {
      const { org: org_ } = carrierRequest(c);
      const { invitationId } = c.req.valid('param');
      await revokeInvitation(c.var.db, org_.orgId, invitationId, c.var.clock.now());
      return c.body(null, 204);
    },
  )
  .patch(
    '/:membershipId',
    op({
      id: 'core.carrier-users.updateMember',
      stories: ['CR-04'],
      description: '`{ role }`',
      responses: { 200: type<MemberView<CarrierRole>>() },
    }),
    validate('param', MembershipParam),
    validate('json', UpdateCarrierUser),
    async (c) => {
      const { org: org_, userId } = carrierRequest(c);
      const view = await updateMember<CarrierRole>(
        c.var.db,
        org_,
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
      id: 'core.carrier-users.deleteMember',
      stories: ['CR-04'],
      description: 'Removes a member from the carrier.',
      responses: { 204: noBody },
    }),
    validate('param', MembershipParam),
    async (c) => {
      const { org: org_ } = carrierRequest(c);
      await removeMember(c.var.db, org_, c.req.valid('param').membershipId);
      return c.body(null, 204);
    },
  );
