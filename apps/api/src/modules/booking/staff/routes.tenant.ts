import { zValidator } from '@hono/zod-validator';
import {
  BoardQuery,
  BookingListQuery,
  CancelBooking,
  CarrierOptionsQuery,
  CreateStaffBooking,
  EventListQuery,
  PutAvis,
  RescheduleBooking,
  SendDriverLink,
} from '@rampflow/shared/modules/booking/api.staff';
import { type Context, Hono } from 'hono';
import * as z from 'zod';
import { type BookingId, idSchema, type SiteId } from '../../../db/ids.ts';
import { requireEntitlement, requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { activeDriverLink, driverLinkUrl } from '../../driver/access.ts';
import { bookingContext } from '../lifecycle/context.ts';
import { createBooking } from '../lifecycle/create.ts';
import { transitionBooking } from '../lifecycle/transition.ts';
import { loadBookingEvents, loadBookingView, requireBooking } from '../lifecycle/view.ts';
import type { LoadTypeId, ResourceId } from '../schema.resources.ts';
import { listBookings, loadBoard } from './board.ts';
import { carrierOptions } from './carrier-options.ts';

const BookingParam = z.object({ bookingId: idSchema<'booking'>() });

/** The booking as the staff API returns it after a read or a command. */
function view(c: Context<AppEnv>, bookingId: BookingId) {
  const ctx = bookingContext(c);
  return loadBookingView(ctx.tx, ctx.access, ctx.tenantId, bookingId, ctx.now);
}

async function driverLink(c: Context<AppEnv>, bookingId: BookingId) {
  const ctx = bookingContext(c);
  await requireBooking(ctx.tx, ctx.tenantId, bookingId);
  const link = await activeDriverLink(ctx.tx, bookingId);
  if (!link) throw new ApiError('not_found', 'The booking has no active driver link');
  return { url: driverLinkUrl(link.id), expiresAt: link.expiresAt.toISOString() };
}

/** Mounted at `/api/t/:orgId/bookings` by modules/index.ts (BK-01, BK-02, BK-03, AV-02, CR-06). */
export const tenant = new Hono<AppEnv>()
  .get(
    '/board',
    requirePermission('booking.view'),
    zValidator('query', BoardQuery, onInvalid),
    async (c) => {
      const ctx = bookingContext(c);
      const q = c.req.valid('query');
      const board = await loadBoard(ctx.tx, ctx.access, {
        tenantId: ctx.tenantId,
        siteId: q.siteId as SiteId,
        day: q.date,
      });
      return c.json(board, 200);
    },
  )
  .get(
    '/',
    requirePermission('booking.view'),
    zValidator('query', BookingListQuery, onInvalid),
    async (c) => {
      const ctx = bookingContext(c);
      return c.json(
        await listBookings(ctx.tx, ctx.access, ctx.tenantId, c.req.valid('query')),
        200,
      );
    },
  )
  .get(
    '/carrier-options',
    requirePermission('booking.staff_book'),
    zValidator('query', CarrierOptionsQuery, onInvalid),
    async (c) => {
      const ctx = bookingContext(c);
      const items = await carrierOptions(ctx.tx, ctx.tenantId, c.req.valid('query').q);
      return c.json({ items }, 200);
    },
  )
  .get(
    '/:bookingId',
    requirePermission('booking.view'),
    zValidator('param', BookingParam, onInvalid),
    async (c) => c.json(await view(c, c.req.valid('param').bookingId), 200),
  )
  .get(
    '/:bookingId/events',
    requirePermission('booking.view'),
    zValidator('param', BookingParam, onInvalid),
    zValidator('query', EventListQuery, onInvalid),
    async (c) => {
      const ctx = bookingContext(c);
      const page = await loadBookingEvents(
        ctx.tx,
        ctx.access,
        { tenantId: ctx.tenantId, bookingId: c.req.valid('param').bookingId },
        c.req.valid('query'),
      );
      return c.json(page, 200);
    },
  )
  .post(
    '/',
    requirePermission('booking.staff_book'),
    zValidator('json', CreateStaffBooking, onInvalid),
    async (c) => {
      const body = c.req.valid('json');
      const result = await createBooking(bookingContext(c), {
        mode: 'staff',
        clientRequestId: body.clientRequestId,
        siteId: body.siteId as SiteId,
        resourceId: body.resourceId as ResourceId | undefined,
        loadTypeId: body.loadTypeId as LoadTypeId,
        startsAt: new Date(body.startsAt),
        carrier: body.carrier,
        avis: body.avis,
        forceReason: body.force ? body.forceReason : undefined,
      });
      return c.json(await view(c, result.booking.id), result.created ? 201 : 200);
    },
  )
  .patch(
    '/:bookingId',
    requirePermission('booking.staff_book'),
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', RescheduleBooking, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const body = c.req.valid('json');
      await transitionBooking(bookingContext(c), bookingId, {
        type: 'reschedule',
        startsAt: body.startsAt,
        resourceId: body.resourceId,
        version: body.version,
        forceReason: body.force ? body.forceReason : undefined,
      });
      return c.json(await view(c, bookingId), 200);
    },
  )
  .put(
    '/:bookingId/avis',
    requirePermission('booking.staff_book'),
    requireEntitlement('avis.basic'),
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', PutAvis, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const body = c.req.valid('json');
      await transitionBooking(bookingContext(c), bookingId, {
        type: 'update_avis',
        avis: body.avis,
        version: body.version,
      });
      return c.json(await view(c, bookingId), 200);
    },
  )
  .post(
    '/:bookingId/cancel',
    requirePermission('booking.staff_book'),
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', CancelBooking, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const reason = c.req.valid('json').reason ?? null;
      await transitionBooking(bookingContext(c), bookingId, { type: 'cancel', reason });
      return c.json(await view(c, bookingId), 200);
    },
  )
  .get(
    '/:bookingId/driver-link',
    requirePermission('booking.staff_book'),
    zValidator('param', BookingParam, onInvalid),
    async (c) => c.json(await driverLink(c, c.req.valid('param').bookingId), 200),
  )
  .post(
    '/:bookingId/driver-link',
    requirePermission('booking.staff_book'),
    zValidator('param', BookingParam, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      await transitionBooking(bookingContext(c), bookingId, { type: 'regenerate_driver_link' });
      return c.json(await driverLink(c, bookingId), 200);
    },
  )
  .post(
    '/:bookingId/driver-link/email',
    requirePermission('booking.staff_book'),
    requireEntitlement('notify.email'),
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', SendDriverLink, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      await transitionBooking(bookingContext(c), bookingId, {
        type: 'send_driver_link',
        ...c.req.valid('json'),
      });
      return c.body(null, 202);
    },
  );
