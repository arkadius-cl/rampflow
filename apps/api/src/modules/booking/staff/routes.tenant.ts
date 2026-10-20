import {
  BoardQuery,
  type BoardView,
  BookingListQuery,
  type BookingPage,
  type BookingView,
  CancelBooking,
  CarrierOptionsQuery,
  CreateStaffBooking,
  EventListQuery,
  PutAvis,
  RescheduleBooking,
  SendDriverLink,
} from '@rampflow/shared/modules/booking/api.staff';
import { CommandName, CreateMode } from '@rampflow/shared/modules/booking/values';
import { ErrorCode, Feature, Permission, StoryId, ValidationTarget } from '@rampflow/shared/values';
import { type Context, Hono } from 'hono';
import * as z from 'zod';
import { type BookingId, idSchema, type SiteId } from '../../../db/ids.ts';
import { requireEntitlement, requirePermission } from '../../../kernel/access.ts';
import { noBody, op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { validate } from '../../../kernel/validate.ts';
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
  if (!link) throw new ApiError(ErrorCode.not_found, 'The booking has no active driver link');
  return { url: driverLinkUrl(link.id), expiresAt: link.expiresAt.toISOString() };
}

/** Mounted at `/api/t/:orgId/bookings` by modules/index.ts (BK-01, BK-02, BK-03, AV-02, CR-06). */
export const tenant = new Hono<AppEnv>()
  .get(
    '/board',
    op({
      id: 'booking.staff.getBoard',
      stories: [StoryId.BK_01],
      description:
        '`?siteId&date`; columns per resource with `slots` (`capacity`, `booked` per grid slot) and `bookings` with `overCapacity`; polled every 15 s',
      responses: { 200: type<BoardView>() },
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.query, BoardQuery),
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
    op({
      id: 'booking.staff.listBookings',
      stories: [StoryId.BK_01],
      description:
        '`?siteId&date&status&limit&cursor`; list view with the same summaries, by start',
      responses: { 200: type<BookingPage>() },
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.query, BookingListQuery),
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
    op({
      id: 'booking.staff.listCarrierOptions',
      stories: [StoryId.BK_02],
      description: '`?q=`; actively linked carriers `{ items: [{ id, name }] }`',
      responses: {},
    }),
    requirePermission(Permission.booking.staff_book),
    validate(ValidationTarget.query, CarrierOptionsQuery),
    async (c) => {
      const ctx = bookingContext(c);
      const items = await carrierOptions(ctx.tx, ctx.tenantId, c.req.valid('query').q);
      return c.json({ items }, 200);
    },
  )
  .get(
    '/:bookingId',
    op({
      id: 'booking.staff.getBooking',
      stories: [StoryId.BK_01, StoryId.BK_03],
      description: 'booking, avis, safety status',
      responses: { 200: type<BookingView>() },
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.param, BookingParam),
    async (c) => c.json(await view(c, c.req.valid('param').bookingId), 200),
  )
  .get(
    '/:bookingId/events',
    op({
      id: 'booking.staff.listBookingEvents',
      stories: [StoryId.YD_08],
      description: '`?limit&cursor`, oldest first; `actor` only with `booking.view_actors`',
      responses: {},
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.query, EventListQuery),
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
    op({
      id: 'booking.staff.createBooking',
      stories: [StoryId.BK_02, StoryId.AV_01],
      description:
        'Needs `booking.force` when `force` is set. `{ clientRequestId, siteId, resourceId?, loadTypeId, startsAt, carrier: { id } | { name }, avis, force?, forceReason? }`; 201, or 200 with the first booking for a repeated `clientRequestId`; `forceReason` required with `force`',
      responses: { 200: type<BookingView>(), 201: type<BookingView>() },
    }),
    requirePermission(Permission.booking.staff_book),
    validate(ValidationTarget.json, CreateStaffBooking),
    async (c) => {
      const body = c.req.valid('json');
      const result = await createBooking(bookingContext(c), {
        mode: CreateMode.staff,
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
    op({
      id: 'booking.staff.updateBooking',
      stories: [StoryId.BK_03],
      description:
        'Needs `booking.force` when `force` is set. Reschedule `{ startsAt, resourceId?, version, force?, forceReason? }`; moves the driver link expiry to the new start plus 7 days',
      responses: { 200: type<BookingView>() },
    }),
    requirePermission(Permission.booking.staff_book),
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, RescheduleBooking),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const body = c.req.valid('json');
      await transitionBooking(bookingContext(c), bookingId, {
        type: CommandName.reschedule,
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
    op({
      id: 'booking.staff.putAvis',
      stories: [StoryId.AV_02],
      description: '`{ avis, version }`; from `checked_in` on, no capacity check',
      responses: { 200: type<BookingView>() },
    }),
    requirePermission(Permission.booking.staff_book),
    requireEntitlement(Feature.avis.basic),
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, PutAvis),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const body = c.req.valid('json');
      await transitionBooking(bookingContext(c), bookingId, {
        type: CommandName.update_avis,
        avis: body.avis,
        version: body.version,
      });
      return c.json(await view(c, bookingId), 200);
    },
  )
  .post(
    '/:bookingId/cancel',
    op({
      id: 'booking.staff.cancelBooking',
      stories: [StoryId.BK_03],
      description: '`{ reason? }` (send `{}` without one)',
      responses: { 200: type<BookingView>() },
    }),
    requirePermission(Permission.booking.staff_book),
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, CancelBooking),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const reason = c.req.valid('json').reason ?? null;
      await transitionBooking(bookingContext(c), bookingId, { type: CommandName.cancel, reason });
      return c.json(await view(c, bookingId), 200);
    },
  )
  .get(
    '/:bookingId/driver-link',
    op({
      id: 'booking.staff.getDriverLink',
      stories: [StoryId.CR_06],
      description: '`{ url, expiresAt }`; 404 once the link is revoked',
      responses: {},
    }),
    requirePermission(Permission.booking.staff_book),
    validate(ValidationTarget.param, BookingParam),
    async (c) => c.json(await driverLink(c, c.req.valid('param').bookingId), 200),
  )
  .post(
    '/:bookingId/driver-link',
    op({
      id: 'booking.staff.regenerateDriverLink',
      stories: [StoryId.CR_06],
      description: 'regenerate; answers the new `{ url, expiresAt }`',
      responses: {},
    }),
    requirePermission(Permission.booking.staff_book),
    validate(ValidationTarget.param, BookingParam),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      await transitionBooking(bookingContext(c), bookingId, {
        type: CommandName.regenerate_driver_link,
      });
      return c.json(await driverLink(c, bookingId), 200);
    },
  )
  .post(
    '/:bookingId/driver-link/email',
    op({
      id: 'booking.staff.emailDriverLink',
      stories: [StoryId.CR_06],
      description: '`{ email, locale }`; 202',
      responses: { 202: noBody },
    }),
    requirePermission(Permission.booking.staff_book),
    requireEntitlement(Feature.notify.email),
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, SendDriverLink),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      await transitionBooking(bookingContext(c), bookingId, {
        type: CommandName.send_driver_link,
        ...c.req.valid('json'),
      });
      return c.body(null, 202);
    },
  );
