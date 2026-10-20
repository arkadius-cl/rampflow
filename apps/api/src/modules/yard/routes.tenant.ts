import type { CommandInput } from '@rampflow/shared/modules/booking/lifecycle';
import {
  BookingParty,
  CommandName,
  CreateMode,
  LinkVia,
  WalkInOutcome,
} from '@rampflow/shared/modules/booking/values';
import {
  type BriefingSession,
  CallBody,
  CandidatesBody,
  CheckInBody,
  CompleteBody,
  DepartBody,
  DockBody,
  type DocksView,
  ExpectedQuery,
  type ExpectedView,
  LinkAcknowledgementBody,
  type OnSiteView,
  SearchBody,
  SiteQuery,
  TurnAwayBody,
  WalkInBody,
  type YardTruck,
} from '@rampflow/shared/modules/yard/api';
import { Feature, Module, Permission, StoryId, ValidationTarget } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import * as z from 'zod';
import { type BookingId, type DockId, idSchema, type SiteId } from '../../db/ids.ts';
import { requireEntitlement, requireModule, requirePermission } from '../../kernel/access.ts';
import { op, type } from '../../kernel/describe.ts';
import type { AppEnv } from '../../kernel/env.ts';
import { validate } from '../../kernel/validate.ts';
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
  if (ctx.actor.party !== BookingParty.staff) throw new Error('yard routes run as staff');
  return ctx.actor.userId;
};

const gate = requirePermission(Permission.yard.gate);
const callToDock = [
  requirePermission(Permission.yard.call),
  requireEntitlement(Feature.yard.call_to_dock),
] as const;
const dockWork = [
  requirePermission(Permission.yard.dock),
  requireEntitlement(Feature.yard.call_to_dock),
] as const;

/** Mounted at `/api/t/:orgId/yard` with `withModule('yard')` (YD-01 to YD-08, BK-02 walk-in). */
export const tenant = new Hono<AppEnv>()
  .get(
    '/expected',
    op({
      id: 'yard.gate.listExpected',
      stories: [StoryId.YD_01],
      description:
        "`?siteId&date?` (`date` defaults to today at the site); `{ siteId, date, timeZone, items }` by start: the day's bookings except cancelled and requested ones, plus no-shows whose `no_show_at` falls on that day. Before check-in, `punctuality` is what a check-in now would record",
      responses: { 200: type<ExpectedView>() },
    }),
    gate,
    validate(ValidationTarget.query, ExpectedQuery),
    async (c) => {
      const q = c.req.valid('query');
      return c.json(await expectedTrucks(yardScope(c, q.siteId), q.date), 200);
    },
  )
  .post(
    '/search',
    op({
      id: 'yard.gate.searchTrucks',
      stories: [StoryId.YD_01],
      description:
        "`{ siteId, q }` (2 to 120 characters); exact booking code (case and surrounding whitespace ignored, so scanner input works), plate announced or seen (normalized), exact reference, or part of the carrier name; active visits and today's no-shows, nearest start first, at most 20",
      responses: {},
    }),
    gate,
    validate(ValidationTarget.json, SearchBody),
    async (c) => {
      const body = c.req.valid('json');
      return c.json({ items: await searchTrucks(yardScope(c, body.siteId), body.q) }, 200);
    },
  )
  .get(
    '/on-site',
    op({
      id: 'yard.gate.listOnSite',
      stories: [StoryId.YD_04],
      description:
        '`?siteId`; trucks in `checked_in` to `done`, whatever day they were booked for, by gate-in; each with `onSiteMinutes`, `waitMinutes` (from `max(checked_in_at, starts_at)` to the first dock timestamp, or to now) and `standgeld` (`onSiteMinutes` above `yard.standgeld_flag_minutes`)',
      responses: { 200: type<OnSiteView>() },
    }),
    gate,
    validate(ValidationTarget.query, SiteQuery),
    async (c) => c.json(await onSiteTrucks(yardScope(c, c.req.valid('query').siteId)), 200),
  )
  .post(
    '/bookings/:bookingId/check-in',
    op({
      id: 'yard.gate.checkIn',
      stories: [StoryId.YD_02],
      description:
        "`{ plateSeen? }`; 409 `safety_missing` under enforcement; the truck shows `safety.status = 'missing'` as a warning otherwise",
      responses: { 200: type<YardTruck>() },
    }),
    gate,
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, CheckInBody),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: CommandName.check_in,
        plateSeen: c.req.valid('json').plateSeen,
      }),
  )
  .post(
    '/bookings/:bookingId/turn-away',
    op({
      id: 'yard.gate.turnAway',
      stories: [StoryId.YD_02],
      description:
        '`{ reason }` from the turn-away list; from `confirmed`, `no_show` or `checked_in`',
      responses: { 200: type<YardTruck>() },
    }),
    gate,
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, TurnAwayBody),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: CommandName.turn_away,
        reason: c.req.valid('json').reason,
      }),
  )
  .post(
    '/bookings/:bookingId/depart',
    op({
      id: 'yard.gate.depart',
      stories: [StoryId.YD_05],
      description: '`{ reason? }`; 422 without a reason before `done`',
      responses: { 200: type<YardTruck>() },
    }),
    gate,
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, DepartBody),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: CommandName.depart,
        reason: c.req.valid('json').reason ?? null,
      }),
  )
  .post(
    '/walk-ins',
    op({
      id: 'yard.gate.createWalkIn',
      stories: [StoryId.YD_03],
      description:
        "`{ clientRequestId, siteId, resourceId?, loadTypeId, carrier: { id } | { name }, plateSeen, outcome: 'check_in', avis }` or `{ ..., outcome: 'turn_away', avis?, reason }`. Starts at the grid slot containing now; never 409 for hours or capacity. 201 with `{ truck, safety }`: the truck in `checked_in` or `turned_away`, or in `confirmed` with `safety: 'missing'` when enforcement blocks the check-in; 200 with the first booking for a repeated `clientRequestId`. 422 on `loadTypeId` when no active resource takes the load type",
      responses: {},
    }),
    gate,
    requirePermission(Permission.booking.walk_in),
    validate(ValidationTarget.json, WalkInBody),
    async (c) => {
      const body = c.req.valid('json');
      const ctx = bookingContext(c);
      const result = await createBooking(ctx, {
        mode: CreateMode.walk_in,
        clientRequestId: body.clientRequestId,
        siteId: body.siteId as SiteId,
        resourceId: body.resourceId as ResourceId | undefined,
        loadTypeId: body.loadTypeId as LoadTypeId,
        carrier: body.carrier,
        plateSeen: body.plateSeen,
        outcome:
          body.outcome === WalkInOutcome.check_in
            ? { kind: WalkInOutcome.check_in, avis: body.avis }
            : { kind: WalkInOutcome.turn_away, avis: body.avis ?? null, reason: body.reason },
      });
      return c.json(
        { truck: await truckOf(ctx, result.booking.id), safety: result.safety },
        result.created ? 201 : 200,
      );
    },
  )
  .post(
    '/bookings/:bookingId/acknowledgement-candidates',
    op({
      id: 'yard.gate.findAcknowledgementCandidates',
      stories: [StoryId.YD_02],
      description:
        "`{ name }` (part of the driver name, at least 2 characters); `{ items }` of the tenant's acknowledgements of instructions that apply to the site and would be valid for this visit, newest first, at most 20; 409 `invalid_transition` once the visit cannot take a briefing",
      responses: {},
    }),
    gate,
    requireModule(Module.safety),
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, CandidatesBody),
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
    op({
      id: 'yard.gate.linkAcknowledgement',
      stories: [StoryId.YD_02],
      description:
        "`{ acknowledgementId }`; `link_acknowledgement` with `via: 'gate_lookup'`; 409 `acknowledgement_invalid`",
      responses: { 200: type<YardTruck>() },
    }),
    gate,
    requireModule(Module.safety),
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, LinkAcknowledgementBody),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: CommandName.link_acknowledgement,
        acknowledgementId: c.req.valid('json').acknowledgementId,
        via: LinkVia.gate_lookup,
      }),
  )
  .post(
    '/bookings/:bookingId/briefing-session',
    op({
      id: 'yard.gate.startBriefingSession',
      stories: [StoryId.YD_02],
      description:
        'no body; issues a 30-minute `staff` driver access and returns `{ url, expiresAt }`',
      responses: { 200: type<BriefingSession>() },
    }),
    gate,
    requireModule(Module.safety),
    validate(ValidationTarget.param, BookingParam),
    async (c) => {
      const ctx = bookingContext(c);
      return c.json(await briefingSession(ctx, c.req.valid('param').bookingId, userOf(ctx)), 200);
    },
  )
  .get(
    '/docks',
    op({
      id: 'yard.dock.listDocks',
      stories: [StoryId.YD_06],
      description:
        '`?siteId`; `{ halls: [{ id, name, docks: [{ id, code, status, temperatureZone, adrAllowed, resourceId, occupant }] }], queue }`; inactive docks left out, maintenance docks kept; the queue holds `checked_in` trucks by slot start, with waits',
      responses: { 200: type<DocksView>() },
    }),
    ...callToDock,
    validate(ValidationTarget.query, SiteQuery),
    async (c) => c.json(await docksView(yardScope(c, c.req.valid('query').siteId)), 200),
  )
  .post(
    '/bookings/:bookingId/call',
    op({
      id: 'yard.dock.callToDock',
      stories: [StoryId.YD_07],
      description:
        '`{ dockId }`; `{ truck, outsideResource }`; 409 `dock_occupied`, 409 `dock_inactive`; from `called` a reassignment',
      responses: {},
    }),
    ...callToDock,
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, CallBody),
    async (c) => {
      const ctx = bookingContext(c);
      const { bookingId } = c.req.valid('param');
      const { dockId } = c.req.valid('json');
      const { booking: called } = await transitionBooking(ctx, bookingId, {
        type: CommandName.call,
        dockId,
      });
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
    op({
      id: 'yard.dock.uncall',
      stories: [StoryId.YD_07],
      description: 'back to `checked_in`; frees the dock',
      responses: { 200: type<YardTruck>() },
    }),
    ...callToDock,
    validate(ValidationTarget.param, BookingParam),
    (c) => command(c, c.req.valid('param').bookingId, { type: CommandName.uncall }),
  )
  .post(
    '/bookings/:bookingId/dock',
    op({
      id: 'yard.dock.arriveAtDock',
      stories: [StoryId.YD_08],
      description: '`{ dockId? }`; 422 without a dock when none is assigned',
      responses: { 200: type<YardTruck>() },
    }),
    ...dockWork,
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, DockBody),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: CommandName.dock,
        dockId: c.req.valid('json').dockId,
      }),
  )
  .post(
    '/bookings/:bookingId/loading',
    op({
      id: 'yard.dock.startLoading',
      stories: [StoryId.YD_08],
      description: '`{ dockId? }`, as `dock`',
      responses: { 200: type<YardTruck>() },
    }),
    ...dockWork,
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, DockBody),
    (c) =>
      command(c, c.req.valid('param').bookingId, {
        type: CommandName.start_loading,
        dockId: c.req.valid('json').dockId,
      }),
  )
  .post(
    '/bookings/:bookingId/complete',
    op({
      id: 'yard.dock.complete',
      stories: [StoryId.YD_08],
      description: '`{ actualLoadUnits, discrepancyNote? }`',
      responses: { 200: type<YardTruck>() },
    }),
    ...dockWork,
    validate(ValidationTarget.param, BookingParam),
    validate(ValidationTarget.json, CompleteBody),
    (c) => {
      const body = c.req.valid('json');
      return command(c, c.req.valid('param').bookingId, {
        type: CommandName.complete,
        actualLoadUnits: body.actualLoadUnits,
        discrepancyNote: body.discrepancyNote ?? null,
      });
    },
  );
