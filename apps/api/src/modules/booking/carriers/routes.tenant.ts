import {
  CarrierInvitationBody,
  type CarrierInvitationView,
  CarrierLinkPatch,
  type CarrierLinkView,
  PublicLinkBody,
  type PublicLinkView,
  type RegistrationView,
  RejectRegistrationBody,
} from '@rampflow/shared/modules/booking/api.carriers';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema, type SiteId } from '../../../db/ids.ts';
import { requireEntitlement, requirePermission } from '../../../kernel/access.ts';
import { noBody, op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
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
  .get(
    '/',
    op({
      id: 'booking.carriers.listCarriers',
      stories: ['TN-03'],
      description:
        '`{ links, invitations }`: linked carriers with name, country, status and source, and invitations neither accepted nor revoked',
      responses: {},
    }),
    manage,
    async (c) => {
      const { tenantId } = tenantRequest(c);
      return c.json(
        {
          links: await listLinks(c.var.db, tenantId),
          invitations: await listPendingInvitations(c.var.db, tenantId),
        },
        200,
      );
    },
  )
  .post(
    '/invitations',
    op({
      id: 'booking.carriers.createCarrierInvitation',
      stories: ['TN-03'],
      description:
        "`{ companyName, email, locale? }` → 201; emails `booking.carrier-invitation` in `locale` (default the inviter's). A pending invitation for the same email is revoked, so inviting again resends",
      responses: { 201: type<CarrierInvitationView>() },
    }),
    manage,
    requireEntitlement('booking.carrier_portal'),
    validate('json', CarrierInvitationBody),
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
    op({
      id: 'booking.carriers.deleteCarrierInvitation',
      stories: ['TN-03'],
      description: '204, also when nothing matched',
      responses: { 204: noBody },
    }),
    manage,
    validate('param', InvitationParam),
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
  .get(
    '/registrations',
    op({
      id: 'booking.carriers.listRegistrations',
      stories: ['TN-04'],
      description:
        '`{ items }`, newest first, every status; each item carries the typed `companyName` and `carrierName`, the org verification bound (null before verification)',
      responses: {},
    }),
    manage,
    publicLinks,
    async (c) => {
      const { tenantId } = tenantRequest(c);
      return c.json({ items: await listRegistrations(c.var.db, tenantId) }, 200);
    },
  )
  .post(
    '/registrations/:registrationId/approve',
    op({
      id: 'booking.carriers.approveRegistration',
      stories: ['TN-04'],
      description:
        'links the carrier (reactivating a deactivated link), emails `booking.registration-approved`; 409 `invalid_transition` with `status` unless `pending_approval`',
      responses: { 200: type<RegistrationView>() },
    }),
    manage,
    publicLinks,
    validate('param', RegistrationParam),
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
    op({
      id: 'booking.carriers.rejectRegistration',
      stories: ['TN-04'],
      description: '`{ reason }`, emails `booking.registration-rejected`; 409 as for approve',
      responses: { 200: type<RegistrationView>() },
    }),
    manage,
    publicLinks,
    validate('param', RegistrationParam),
    validate('json', RejectRegistrationBody),
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
  .get(
    '/public-links',
    op({
      id: 'booking.carriers.listPublicLinks',
      stories: ['TN-04'],
      description:
        '`{ items }`: per site the slug (or `null`), `enabled` (`booking.public_link_enabled`) and `mode` (`booking.public_registration_mode`)',
      responses: {},
    }),
    manage,
    publicLinks,
    async (c) => {
      const { tenantId } = tenantRequest(c);
      return c.json({ items: await listPublicLinks(c.var.db, tenantId, c.var.access) }, 200);
    },
  )
  .post(
    '/public-links',
    op({
      id: 'booking.carriers.createPublicLink',
      stories: ['TN-04'],
      description:
        "`{ siteId }`; 201 when it creates the site's slug, 200 with the existing one; 404 for a site of another tenant",
      responses: { 200: type<PublicLinkView>(), 201: type<PublicLinkView>() },
    }),
    manage,
    publicLinks,
    validate('json', PublicLinkBody),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const siteId = c.req.valid('json').siteId as SiteId;
      const { view, created } = await ensurePublicLink(c.var.db, tenantId, siteId, c.var.access);
      return c.json(view, created ? 201 : 200);
    },
  )
  .post(
    '/public-links/:siteId/regenerate',
    op({
      id: 'booking.carriers.regeneratePublicLink',
      stories: ['TN-04'],
      description: 'revokes the slug and issues a new one, for a link that leaked',
      responses: { 200: type<PublicLinkView>() },
    }),
    manage,
    publicLinks,
    validate('param', SiteParam),
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
    op({
      id: 'booking.carriers.updateCarrierLink',
      stories: ['TN-03'],
      description: "`{ status: 'active' | 'deactivated' }`; 404 without a link",
      responses: { 200: type<CarrierLinkView>() },
    }),
    manage,
    validate('param', CarrierParam),
    validate('json', CarrierLinkPatch),
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
