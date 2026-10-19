import { zValidator } from '@hono/zod-validator';
import {
  CarrierInvitationBody,
  CarrierLinkPatch,
  PublicLinkBody,
  RejectRegistrationBody,
} from '@rampflow/shared/modules/booking/api.carriers';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema, type SiteId } from '../../../db/ids.ts';
import { requireEntitlement, requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { tenantRequest } from '../../core/sites/tenant.ts';
import {
  ensurePublicLink,
  listPublicLinks,
  regeneratePublicLink,
} from '../registration/public-links.ts';
import { decideRegistration, listRegistrations } from '../registration/registrations.ts';
import { inviteCarrier, listPendingInvitations, revokeInvitation } from './invitations.ts';
import { listLinks, setLinkStatus } from './links.ts';

const CarrierParam = z.object({ carrierId: idSchema<'carrier'>() });
const InvitationParam = z.object({ invitationId: z.uuid() });
const RegistrationParam = z.object({ registrationId: idSchema<'carrier_registration'>() });
const SiteParam = z.object({ siteId: idSchema<'site'>() });

const manage = requirePermission('booking.manage_carriers');
const publicLinks = requireEntitlement('booking.public_link');

/** Mounted at `/api/t/:orgId/carriers` by modules/index.ts (TN-03, TN-04). */
export const tenant = new Hono<AppEnv>()
  .get('/', manage, async (c) => {
    const { tenantId } = tenantRequest(c);
    return c.json(
      {
        links: await listLinks(c.var.db, tenantId),
        invitations: await listPendingInvitations(c.var.db, tenantId),
      },
      200,
    );
  })
  .post(
    '/invitations',
    manage,
    requireEntitlement('booking.carrier_portal'),
    zValidator('json', CarrierInvitationBody, onInvalid),
    async (c) => {
      const { tenantId, userId, entitlements } = tenantRequest(c);
      if (!userId) throw new Error('carrier invitations need a signed-in inviter');
      const invitation = await inviteCarrier(c.var.db, {
        tenantId,
        invitedBy: userId,
        body: c.req.valid('json'),
        entitlements,
        now: c.var.clock.now(),
      });
      return c.json(invitation, 201);
    },
  )
  .delete(
    '/invitations/:invitationId',
    manage,
    zValidator('param', InvitationParam, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      await revokeInvitation(
        c.var.db,
        tenantId,
        c.req.valid('param').invitationId,
        c.var.clock.now(),
      );
      return c.body(null, 204);
    },
  )
  .get('/registrations', manage, publicLinks, async (c) => {
    const { tenantId } = tenantRequest(c);
    return c.json({ items: await listRegistrations(c.var.db, tenantId) }, 200);
  })
  .post(
    '/registrations/:registrationId/approve',
    manage,
    publicLinks,
    zValidator('param', RegistrationParam, onInvalid),
    async (c) => {
      const { tenantId, userId, entitlements } = tenantRequest(c);
      const view = await decideRegistration(c.var.db, {
        tenantId,
        registrationId: c.req.valid('param').registrationId,
        decision: { status: 'approved' },
        decidedBy: userId,
        entitlements,
        now: c.var.clock.now(),
      });
      return c.json(view, 200);
    },
  )
  .post(
    '/registrations/:registrationId/reject',
    manage,
    publicLinks,
    zValidator('param', RegistrationParam, onInvalid),
    zValidator('json', RejectRegistrationBody, onInvalid),
    async (c) => {
      const { tenantId, userId, entitlements } = tenantRequest(c);
      const view = await decideRegistration(c.var.db, {
        tenantId,
        registrationId: c.req.valid('param').registrationId,
        decision: { status: 'rejected', reason: c.req.valid('json').reason },
        decidedBy: userId,
        entitlements,
        now: c.var.clock.now(),
      });
      return c.json(view, 200);
    },
  )
  .get('/public-links', manage, publicLinks, async (c) => {
    const { tenantId } = tenantRequest(c);
    return c.json({ items: await listPublicLinks(c.var.db, tenantId, c.var.access) }, 200);
  })
  .post(
    '/public-links',
    manage,
    publicLinks,
    zValidator('json', PublicLinkBody, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const siteId = c.req.valid('json').siteId as SiteId;
      const { view, created } = await ensurePublicLink(c.var.db, tenantId, siteId, c.var.access);
      return c.json(view, created ? 201 : 200);
    },
  )
  .post(
    '/public-links/:siteId/regenerate',
    manage,
    publicLinks,
    zValidator('param', SiteParam, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const view = await regeneratePublicLink(
        c.var.db,
        tenantId,
        c.req.valid('param').siteId,
        c.var.access,
        c.var.clock.now(),
      );
      return c.json(view, 200);
    },
  )
  .patch(
    '/:carrierId',
    manage,
    zValidator('param', CarrierParam, onInvalid),
    zValidator('json', CarrierLinkPatch, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const view = await setLinkStatus(
        c.var.db,
        tenantId,
        c.req.valid('param').carrierId,
        c.req.valid('json').status,
        c.var.clock.now(),
      );
      return c.json(view, 200);
    },
  );
