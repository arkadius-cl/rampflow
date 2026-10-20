import {
  PortalBookingListQuery,
  type PortalBookingPage,
  type PortalBookingView,
  type PortalDriverLink,
  type PortalRebook,
} from '@rampflow/shared/modules/booking/api.portal';
import { type Context, Hono } from 'hono';
import * as z from 'zod';
import { type BookingId, idSchema, type TenantId } from '../../../db/ids.ts';
import { loadAccess, requirePermission } from '../../../kernel/access.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { validate } from '../../../kernel/validate.ts';
import { activeDriverLink, driverLinkUrl } from '../../driver/access.ts';
import { listPortalBookings, loadPortalBooking, rebookOf, requireOwnBooking } from './read.ts';

export const BookingParam = z.object({ bookingId: idSchema<'booking'>() });

function carrierOf(c: Context<AppEnv>) {
  const { scope } = c.var;
  if (scope.party !== 'carrier') throw new Error(`portal read under party ${scope.party}`);
  return scope;
}

/** CR-06: the booking's active driver link, recomputed from its row id (ADR-0008). */
export async function portalDriverLink(
  c: Context<AppEnv>,
  bookingId: BookingId,
): Promise<PortalDriverLink> {
  const link = await activeDriverLink(c.var.db, bookingId);
  if (!link) throw new ApiError('not_found', 'The booking has no active driver link');
  return { url: driverLinkUrl(link.id), expiresAt: link.expiresAt.toISOString() };
}

/** Mounted at `/api/c/:orgId/bookings` by modules/index.ts (CR-05, CR-06, BK-06). */
export const carrier = new Hono<AppEnv>()
  .get(
    '/',
    op({
      id: 'booking.portal.listBookings',
      stories: ['CR-05'],
      description:
        "all tenants; `?tenantId&siteId&from&to&status&when&order&limit&cursor`; `from` and `to` are site-local dates of each booking's start; `when=upcoming` keeps trucks on site and requested or confirmed bookings starting today or later in site time, `when=past` keeps the rest (every final booking, and pending ones from earlier days); `order` is `asc` (default, by start) or `desc` (the past, newest first); `{ items: PortalBookingSummary[], nextCursor }`",
      responses: { 200: type<PortalBookingPage>() },
    }),
    requirePermission('booking.view'),
    validate('query', PortalBookingListQuery),
    async (c) => {
      const page = await listPortalBookings(
        c.var.db,
        carrierOf(c).carrierId,
        c.req.valid('query'),
        c.var.clock.now(),
      );
      return c.json(page, 200);
    },
  )
  .get(
    '/:bookingId',
    op({
      id: 'booking.portal.getBooking',
      stories: ['CR-05'],
      description: '`PortalBookingView`',
      responses: { 200: type<PortalBookingView>() },
    }),
    requirePermission('booking.view'),
    validate('param', BookingParam),
    async (c) => {
      const scope = carrierOf(c);
      const { db, clock } = c.var;
      // Settings and entitlements of the booking's tenant, as the carrier acting there sees them.
      const atTenant = (tenantId: TenantId) =>
        loadAccess(db, { ...scope, party: 'carrier_at_tenant', tenantId }, clock);
      const view = await loadPortalBooking(
        db,
        scope.carrierId,
        c.req.valid('param').bookingId,
        atTenant,
        clock.now(),
      );
      return c.json(view, 200);
    },
  )
  .get(
    '/:bookingId/driver-link',
    op({
      id: 'booking.portal.getDriverLink',
      stories: ['CR-06'],
      description: '`{ url, expiresAt }`; 404 without an active link',
      responses: { 200: type<PortalDriverLink>() },
    }),
    requirePermission('booking.book'),
    validate('param', BookingParam),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      await requireOwnBooking(c.var.db, carrierOf(c).carrierId, bookingId);
      return c.json(await portalDriverLink(c, bookingId), 200);
    },
  )
  .get(
    '/:bookingId/rebook',
    op({
      id: 'booking.portal.getRebook',
      stories: ['BK-06'],
      description:
        '`{ tenantId, siteId, loadTypeId, avis }`: the avis without references and driver; no date',
      responses: { 200: type<PortalRebook>() },
    }),
    requirePermission('booking.book'),
    validate('param', BookingParam),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      return c.json(await rebookOf(c.var.db, carrierOf(c).carrierId, bookingId), 200);
    },
  );
