import { zValidator } from '@hono/zod-validator';
import type { CommandInput } from '@rampflow/shared/modules/booking/lifecycle';
import {
  CallBody,
  CandidatesBody,
  CheckInBody,
  CompleteBody,
  DepartBody,
  DockBody,
  ExpectedQuery,
  LinkAcknowledgementBody,
  SearchBody,
  SiteQuery,
  TurnAwayBody,
  WalkInBody,
} from '@rampflow/shared/modules/yard/api';
import { and, eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import * as z from 'zod';
import { type BookingId, type DockId, idSchema, type SiteId } from '../../db/ids.ts';
import { requireEntitlement, requireModule, requirePermission } from '../../kernel/access.ts';
import type { AppEnv } from '../../kernel/env.ts';
import { onInvalid } from '../../kernel/validate.ts';
import { type BookingContext, bookingContext } from '../booking/lifecycle/context.ts';
import { createBooking } from '../booking/lifecycle/create.ts';
import { transitionBooking } from '../booking/lifecycle/transition.ts';
import { type LoadTypeId, type ResourceId, resourceDock } from '../booking/schema.resources.ts';
import { acknowledgementCandidates, briefingSession } from './briefing.ts';
import { docksView } from './docks.ts';
import { expectedTrucks, onSiteTrucks, searchTrucks, truckOf, type YardScope } from './trucks.ts';

const BookingParam = z.object({ bookingId: idSchema<'booking'>() });

function yardScope(c: Context<AppEnv>, siteId: string): YardScope {
  const ctx = bookingContext(c);
  return {
    tx: ctx.tx,
    access: ctx.access,
    tenantId: ctx.tenantId,
    siteId: siteId as SiteId,
    now: ctx.now,
  };
}

/** Runs one lifecycle command and answers the truck as it is afterwards. */
async function command(c: Context<AppEnv>, bookingId: BookingId, input: CommandInput) {
  const ctx = bookingContext(c);
  await transitionBooking(ctx, bookingId, input);
  return c.json(await truckOf(ctx, bookingId), 200);
}

const userOf = (ctx: BookingContext) => {
  if (ctx.actor.party !== 'staff') throw new Error('yard routes run as staff');
  return ctx.actor.userId;
};

const gate = requirePermission('yard.gate');
const callToDock = [
  requirePermission('yard.call'),
  requireEntitlement('yard.call_to_dock'),
] as const;
const dockWork = [requirePermission('yard.dock'), requireEntitlement('yard.call_to_dock')] as const;

/** Mounted at `/api/t/:orgId/yard` with `withModule('yard')` (YD-01 to YD-08, BK-02 walk-in). */
export const tenant = new Hono<AppEnv>()
  .get('/expected', gate, zValidator('query', ExpectedQuery, onInvalid), async (c) => {
    const q = c.req.valid('query');
    return c.json(await expectedTrucks(yardScope(c, q.siteId), q.date), 200);
  })
  .post('/search', gate, zValidator('json', SearchBody, onInvalid), async (c) => {
    const body = c.req.valid('json');
    return c.json({ items: await searchTrucks(yardScope(c, body.siteId), body.q) }, 200);
  })
  .get('/on-site', gate, zValidator('query', SiteQuery, onInvalid), async (c) =>
    c.json(await onSiteTrucks(yardScope(c, c.req.valid('query').siteId)), 200),
  )
  .post(
    '/bookings/:bookingId/check-in',
    gate,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', CheckInBody, onInvalid),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: 'check_in',
        plateSeen: c.req.valid('json').plateSeen,
      }),
  )
  .post(
    '/bookings/:bookingId/turn-away',
    gate,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', TurnAwayBody, onInvalid),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: 'turn_away',
        reason: c.req.valid('json').reason,
      }),
  )
  .post(
    '/bookings/:bookingId/depart',
    gate,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', DepartBody, onInvalid),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: 'depart',
        reason: c.req.valid('json').reason ?? null,
      }),
  )
  .post(
    '/walk-ins',
    gate,
    requirePermission('booking.walk_in'),
    zValidator('json', WalkInBody, onInvalid),
    async (c) => {
      const body = c.req.valid('json');
      const ctx = bookingContext(c);
      const result = await createBooking(ctx, {
        mode: 'walk_in',
        clientRequestId: body.clientRequestId,
        siteId: body.siteId as SiteId,
        resourceId: body.resourceId as ResourceId | undefined,
        loadTypeId: body.loadTypeId as LoadTypeId,
        carrier: body.carrier,
        plateSeen: body.plateSeen,
        outcome:
          body.outcome === 'check_in'
            ? { kind: 'check_in', avis: body.avis }
            : { kind: 'turn_away', avis: body.avis ?? null, reason: body.reason },
      });
      return c.json(
        { truck: await truckOf(ctx, result.booking.id), safety: result.safety },
        result.created ? 201 : 200,
      );
    },
  )
  .post(
    '/bookings/:bookingId/acknowledgement-candidates',
    gate,
    requireModule('safety'),
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', CandidatesBody, onInvalid),
    async (c) => {
      const items = await acknowledgementCandidates(
        bookingContext(c),
        c.req.valid('param').bookingId,
        c.req.valid('json').name,
      );
      return c.json({ items }, 200);
    },
  )
  .post(
    '/bookings/:bookingId/acknowledgements',
    gate,
    requireModule('safety'),
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', LinkAcknowledgementBody, onInvalid),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: 'link_acknowledgement',
        acknowledgementId: c.req.valid('json').acknowledgementId,
        via: 'gate_lookup',
      }),
  )
  .post(
    '/bookings/:bookingId/briefing-session',
    gate,
    requireModule('safety'),
    zValidator('param', BookingParam, onInvalid),
    async (c) => {
      const ctx = bookingContext(c);
      return c.json(await briefingSession(ctx, c.req.valid('param').bookingId, userOf(ctx)), 200);
    },
  )
  .get('/docks', ...callToDock, zValidator('query', SiteQuery, onInvalid), async (c) =>
    c.json(await docksView(yardScope(c, c.req.valid('query').siteId)), 200),
  )
  .post(
    '/bookings/:bookingId/call',
    ...callToDock,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', CallBody, onInvalid),
    async (c) => {
      const ctx = bookingContext(c);
      const { bookingId } = c.req.valid('param');
      const { dockId } = c.req.valid('json');
      const { booking: called } = await transitionBooking(ctx, bookingId, { type: 'call', dockId });
      const [member] = await ctx.tx
        .select({ dockId: resourceDock.dockId })
        .from(resourceDock)
        .where(
          and(
            eq(resourceDock.resourceId, called.resourceId),
            eq(resourceDock.dockId, dockId as DockId),
          ),
        );
      return c.json(
        { truck: await truckOf(ctx, bookingId), outsideResource: member === undefined },
        200,
      );
    },
  )
  .post(
    '/bookings/:bookingId/uncall',
    ...callToDock,
    zValidator('param', BookingParam, onInvalid),
    (c) => command(c, c.req.valid('param').bookingId, { type: 'uncall' }),
  )
  .post(
    '/bookings/:bookingId/dock',
    ...dockWork,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', DockBody, onInvalid),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: 'dock',
        dockId: c.req.valid('json').dockId,
      }),
  )
  .post(
    '/bookings/:bookingId/loading',
    ...dockWork,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', DockBody, onInvalid),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: 'start_loading',
        dockId: c.req.valid('json').dockId,
      }),
  )
  .post(
    '/bookings/:bookingId/complete',
    ...dockWork,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', CompleteBody, onInvalid),
    (c) => {
      const body = c.req.valid('json');
      return command(c, c.req.valid('param').bookingId, {
        type: 'complete',
        actualLoadUnits: body.actualLoadUnits,
        discrepancyNote: body.discrepancyNote ?? null,
      });
    },
  );
