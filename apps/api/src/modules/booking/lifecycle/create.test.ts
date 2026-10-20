import { randomUUID } from 'node:crypto';
import { AvisInput } from '@rampflow/shared/modules/avis/avis';
import {
  BookingStatus,
  CommandName,
  CreatedParty,
  CreateMode,
  Direction,
  ResourceKind,
  TurnAwayReason,
  WalkInOutcome,
} from '@rampflow/shared/modules/booking/values';
import { ConflictReason, ErrorCode, PromiseStatus } from '@rampflow/shared/values';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { app } from '../../../app.ts';
import type { SiteId } from '../../../db/ids.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { seedBriefing } from '../../safety/authoring/fixtures.ts';
import { type CapacitySite, capacitySite } from '../capacity/fixtures.ts';
import { bookableResource, loadTypeResource, resourceDock } from '../schema.resources.ts';
import { booking } from '../schema.ts';
import { createBooking, type WalkInCreate } from './create.ts';
import { asCarrier, asStaff, avisInput, bookableSite, eventsOf, seedBooking } from './fixtures.ts';
import { transitionBooking } from './transition.ts';

let w: World;
beforeAll(async () => {
  w = await world();
});

const NOW = new Date('2026-10-19T08:00:00Z');
/** Monday 2026-11-02, 08:00 CET. */
const MON_0800 = new Date('2026-11-02T07:00:00Z');
const avis = AvisInput.parse(avisInput());

const failure = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => {
      if (e instanceof ApiError) return { code: e.code, ...e.details };
      throw e;
    },
  );

/** One dock, open Monday 06:00 to 14:00, a 60-minute load type: one truck at a time. */
const oneDockSite = (o: Partial<Parameters<typeof capacitySite>[1]> = {}) =>
  capacitySite(w.A.tenantId, { hours: [[1, '06:00', '14:00']], minutes: 60, ...o });

const staffCreate = (s: CapacitySite, startsAt: Date, o: { forceReason?: string } = {}) =>
  asStaff(w.A, w.A.users.dispatcher, NOW, (ctx) =>
    createBooking(ctx, {
      mode: CreateMode.staff,
      clientRequestId: randomUUID(),
      siteId: s.siteId,
      loadTypeId: s.loadTypeId,
      startsAt,
      carrier: { name: 'Spedition Freitext' },
      avis,
      ...o,
    }),
  );

const rowsAt = (s: CapacitySite) =>
  ownerCount('booking', sql`site_id = ${s.siteId} and status = 'confirmed'`);

describe('capacity under concurrency (ADR-0004)', () => {
  it('lets one of two racing staff creates take the last unit and answers 409 with offers', async () => {
    const s = await oneDockSite();
    const post = () =>
      as(app, w.A.users.dispatcher).post(`/api/t/${w.A.tenantId}/bookings`, {
        body: {
          clientRequestId: randomUUID(),
          siteId: s.siteId,
          loadTypeId: s.loadTypeId,
          startsAt: MON_0800.toISOString(),
          carrier: { name: 'Spedition Freitext' },
          avis: avisInput(),
        },
      });
    const responses = await Promise.all([post(), post()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = responses.find((r) => r.status === 409);
    const body = (await loser?.json()) as {
      error: { details: { reason: string; offers: { starts: { startsAt: string }[] } } };
    };
    expect(body.error.details.reason).toBe('capacity_full');
    const offered = body.error.details.offers.starts.map((o) => o.startsAt);
    expect(offered).not.toContain(MON_0800.toISOString());
    expect(offered).toContain('2026-11-02T08:00:00.000Z');
    expect(await rowsAt(s)).toBe(1);
  });

  it('runs a carrier create and a staff reschedule over two resources without a deadlock', async () => {
    const s = await oneDockSite({ hours: [[1, '00:00', '24:00']] });
    const [second] = await ownerDb()
      .insert(bookableResource)
      .values({
        tenantId: s.tenantId,
        siteId: s.siteId,
        kind: ResourceKind.single,
        name: 'Rampe 2',
        directions: [Direction.inbound],
        sort: 1,
      })
      .returning();
    if (!second) throw new Error('no resource');
    const [dock2] = await ownerDb()
      .execute<{ id: string }>(
        sql`insert into dock (tenant_id, site_id, hall_id, code, door_type, temperature_zone, status)
            select tenant_id, site_id, hall_id, 'D-2', door_type, temperature_zone, 'active'
            from dock where id = ${s.dockIds[0]} returning id`,
      )
      .then((r) => r.rows);
    await ownerDb()
      .insert(resourceDock)
      .values({
        dockId: dock2?.id as never,
        resourceId: second.id,
        resourceKind: 'single',
        siteId: s.siteId,
        tenantId: s.tenantId,
      });
    await ownerDb().insert(loadTypeResource).values({
      loadTypeId: s.loadTypeId,
      resourceId: second.id,
      siteId: s.siteId,
      tenantId: s.tenantId,
    });
    const errors: unknown[] = [];
    for (let hour = 0; hour < 8; hour++) {
      const start = new Date(MON_0800.getTime() + hour * 3_600_000);
      const onSecond = await seedBooking(w.A, { startsAt: start, site: s, minutes: 60 });
      await ownerDb()
        .update(booking)
        .set({ resourceId: second.id })
        .where(eq(booking.id, onSecond.id));
      const carrier = asCarrier(w.A, w.A.users.carrier_user, NOW, (ctx) =>
        createBooking(ctx, {
          mode: CreateMode.carrier,
          clientRequestId: randomUUID(),
          siteId: s.siteId,
          loadTypeId: s.loadTypeId,
          startsAt: new Date(start.getTime() + 30 * 60_000),
          avis,
        }),
      );
      const reschedule = asStaff(w.A, w.A.users.dispatcher, NOW, (ctx) =>
        transitionBooking(ctx, onSecond.id, {
          type: CommandName.reschedule,
          startsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
          resourceId: s.resourceId,
          version: 1,
        }),
      );
      for (const r of await Promise.allSettled([carrier, reschedule])) {
        if (r.status === PromiseStatus.rejected) errors.push(r.reason);
      }
    }
    const deadlocks = errors.filter((e) => JSON.stringify(e).includes('40P01'));
    expect(deadlocks).toEqual([]);
    expect(errors.every((e) => e instanceof ApiError && e.code === ErrorCode.conflict)).toBe(true);
  });
});

describe('createBooking in staff mode (BK-02)', () => {
  it('returns the first booking with 200 for a repeated clientRequestId and keeps one row', async () => {
    const s = await oneDockSite({ docks: 2 });
    const body = {
      clientRequestId: randomUUID(),
      siteId: s.siteId,
      loadTypeId: s.loadTypeId,
      startsAt: MON_0800.toISOString(),
      carrier: { id: w.A.carrierId },
      avis: avisInput(),
    };
    const post = () =>
      as(app, w.A.users.dispatcher).post(`/api/t/${w.A.tenantId}/bookings`, { body });
    const first = await post();
    const again = await post();
    expect([first.status, again.status]).toEqual([201, 200]);
    const [a, b] = (await Promise.all([first.json(), again.json()])) as { id: string }[];
    expect(b?.id).toBe(a?.id);
    const racing = await Promise.all([post(), post()]);
    expect(racing.map((r) => r.status)).toEqual([200, 200]);
    expect(await rowsAt(s)).toBe(1);
  });

  it('enforces the daily cap and books over it only when forced, with the reason in the event', async () => {
    const s = await oneDockSite({ docks: 2, dailyCap: 1 });
    await staffCreate(s, MON_0800);
    const later = new Date(MON_0800.getTime() + 3 * 3_600_000);
    expect(await failure(staffCreate(s, later))).toMatchObject({
      code: ErrorCode.conflict,
      reason: ConflictReason.daily_cap_reached,
      offers: { starts: [] },
    });
    const forced = await staffCreate(s, later, { forceReason: 'Eilauftrag' });
    expect(forced.booking.forced).toBe(true);
    const [created] = await eventsOf(forced.booking.id);
    expect(created?.data).toMatchObject({ forced: true, forceReason: 'Eilauftrag', walkIn: false });
  });

  it('books a full slot when forced but never a closed one', async () => {
    const s = await oneDockSite();
    await staffCreate(s, MON_0800);
    expect(await failure(staffCreate(s, MON_0800))).toMatchObject({
      reason: ConflictReason.capacity_full,
    });
    const forced = await staffCreate(s, MON_0800, { forceReason: 'Kunde wartet' });
    expect(forced.created).toBe(true);
    const closed = new Date('2026-11-02T14:00:00Z');
    expect(await failure(staffCreate(s, closed, { forceReason: 'Nachtschicht' }))).toMatchObject({
      reason: ConflictReason.closed,
    });
    expect(await rowsAt(s)).toBe(2);
  });

  it('ignores lead time and horizon for staff; a carrier gets 409 not_offered', async () => {
    const s = await oneDockSite({ hours: [[1, '00:00', '24:00']] });
    const soon = new Date('2026-11-02T07:30:00Z');
    const now = new Date('2026-11-02T07:20:00Z');
    const staffSoon = await asStaff(w.A, w.A.users.dispatcher, now, (ctx) =>
      createBooking(ctx, {
        mode: CreateMode.staff,
        clientRequestId: randomUUID(),
        siteId: s.siteId,
        loadTypeId: s.loadTypeId,
        startsAt: soon,
        carrier: { name: 'Spedition Freitext' },
        avis,
      }),
    );
    expect(staffSoon.created).toBe(true);
    const farAway = new Date('2027-05-03T07:00:00Z');
    expect((await staffCreate(s, farAway)).created).toBe(true);
    const carrier = (startsAt: Date, at: Date) =>
      asCarrier(w.A, w.A.users.carrier_user, at, (ctx) =>
        createBooking(ctx, {
          mode: CreateMode.carrier,
          clientRequestId: randomUUID(),
          siteId: s.siteId,
          loadTypeId: s.loadTypeId,
          startsAt,
          avis,
        }),
      );
    const hourLater = new Date(soon.getTime() + 3_600_000);
    expect(await failure(carrier(hourLater, now))).toMatchObject({
      reason: ConflictReason.not_offered,
    });
    expect(await failure(carrier(new Date('2027-05-03T09:00:00Z'), NOW))).toMatchObject({
      reason: ConflictReason.not_offered,
    });
    const offered = await carrier(new Date('2026-11-02T12:00:00Z'), NOW);
    expect(offered.booking).toMatchObject({
      createdParty: CreatedParty.carrier,
      carrierId: w.A.carrierId,
    });
  });

  it('rejects a start off the slot grid', async () => {
    const s = await oneDockSite();
    expect(await failure(staffCreate(s, new Date('2026-11-02T07:10:00Z')))).toMatchObject({
      reason: ConflictReason.not_offered,
    });
  });
});

describe('walk-in mode (YD-03)', () => {
  let walkInWorld: World;
  beforeAll(async () => {
    walkInWorld = await world();
    // Pool of two docks, open Monday 06:00 to 22:00 only.
    await bookableSite(walkInWorld.A, ownerDb(), [[1, '06:00', '22:00']]);
  });

  const walkIn = (now: Date, outcome: WalkInCreate['outcome']) =>
    asStaff(walkInWorld.A, walkInWorld.A.users.gate_operator, now, (ctx) =>
      createBooking(ctx, {
        mode: CreateMode.walk_in,
        clientRequestId: randomUUID(),
        siteId: walkInWorld.A.sites[0].id as SiteId,
        loadTypeId: walkInWorld.A.sites[0].loadTypeId,
        carrier: { name: 'Unangemeldet KG' },
        plateSeen: 'B-XY 123',
        outcome,
      }),
    );

  it('checks in before opening hours as a gate operator, starting at the grid slot of now', async () => {
    const now = new Date('2026-11-02T04:50:00Z'); // Monday 05:50 CET, before the 06:00 opening
    const result = await walkIn(now, { kind: WalkInOutcome.check_in, avis });
    expect(result.booking).toMatchObject({
      status: BookingStatus.checked_in,
      walkIn: true,
      forced: false,
      startsAt: new Date('2026-11-02T04:30:00Z'),
      punctuality: null,
      checkedInAt: now,
    });
    const events = await eventsOf(result.booking.id);
    expect(events.map((e) => e.type)).toEqual(['created', 'checked_in']);
    expect(events[0]?.data).toMatchObject({ walkIn: true, forced: false });
    expect(await ownerCount('driver_access', sql`booking_id = ${result.booking.id}`)).toBe(1);
  });

  it('checks in at a full slot', async () => {
    const at = new Date('2026-11-02T09:00:00Z');
    for (const _ of [1, 2]) await seedBooking(walkInWorld.A, { startsAt: at, minutes: 30 });
    const result = await walkIn(new Date('2026-11-02T09:05:00Z'), {
      kind: WalkInOutcome.check_in,
      avis,
    });
    expect(result.booking).toMatchObject({ status: BookingStatus.checked_in, startsAt: at });
  });

  it('turns an unbooked truck away without a driver link, recording the plate', async () => {
    const now = new Date('2026-11-02T10:10:00Z');
    const result = await walkIn(now, {
      kind: WalkInOutcome.turn_away,
      avis: null,
      reason: TurnAwayReason.documents_missing,
    });
    expect(result.booking).toMatchObject({
      status: BookingStatus.turned_away,
      turnAwayReason: 'documents_missing',
      walkIn: true,
    });
    expect(await ownerCount('driver_access', sql`booking_id = ${result.booking.id}`)).toBe(0);
    expect(
      await ownerCount('avis', sql`booking_id = ${result.booking.id} and plate_seen = 'BXY123'`),
    ).toBe(1);
    expect((await eventsOf(result.booking.id)).map((e) => e.type)).toEqual([
      'created',
      'turned_away',
    ]);
  });

  it('stays confirmed with "missing" when safety enforcement blocks the check-in', async () => {
    const enforced = await world();
    await bookableSite(enforced.A);
    await seedBriefing(ownerDb(), enforced.A);
    const result = await asStaff(enforced.A, enforced.A.users.gate_operator, NOW, (ctx) =>
      createBooking(ctx, {
        mode: CreateMode.walk_in,
        clientRequestId: randomUUID(),
        siteId: enforced.A.sites[0].id,
        loadTypeId: enforced.A.sites[0].loadTypeId,
        carrier: { name: 'Unangemeldet KG' },
        plateSeen: 'B-XY 123',
        outcome: { kind: WalkInOutcome.check_in, avis },
      }),
    );
    expect(result).toMatchObject({
      safety: 'missing',
      booking: { status: BookingStatus.confirmed, walkIn: true },
    });
    const [row] = await ownerDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(booking)
      .where(and(eq(booking.id, result.booking.id), eq(booking.status, 'confirmed')));
    expect(row?.n).toBe(1);
  });
});
