import { randomUUID } from 'node:crypto';
import {
  BOOKING_STATUSES,
  type BookingStatus,
  COMMAND_NAMES,
  COMMANDS,
  type CommandDef,
  type CommandInput,
  type CommandName,
  sourceStates,
} from '@rampflow/shared/modules/booking/lifecycle';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { app } from '../../../app.ts';
import type { DockId } from '../../../db/ids.ts';
import { withScope } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { seedBriefing } from '../../safety/authoring/fixtures.ts';
import { safetyAcknowledgement } from '../../safety/schema.ts';
import { type CapacitySite, capacitySite } from '../capacity/fixtures.ts';
import { booking, bookingEvent } from '../schema.ts';
import { asStaff, asSystem, bookableSite, bookingRow, eventsOf, seedBooking } from './fixtures.ts';
import { transitionBooking } from './transition.ts';

let w: World;
beforeAll(async () => {
  w = await world();
  await bookableSite(w.A);
});

const NOW = new Date('2026-11-02T08:00:00Z');
const outcome = (p: Promise<unknown>) =>
  p.then(
    () => ({ code: 'ok' }) as const,
    (e: unknown) => {
      if (e instanceof ApiError) return { code: e.code, ...e.details };
      throw e;
    },
  );

describe('transitionBooking rejects every command from a state outside its source list', () => {
  let site: CapacitySite;
  const byStatus = new Map<BookingStatus, string>();
  const freeDock = () => site.dockIds[3] as DockId;

  beforeAll(async () => {
    site = await capacitySite(w.A.tenantId, { hours: [[1, '00:00', '24:00']], docks: 4 });
    const holding = ['called', 'at_dock', 'loading'];
    for (const status of BOOKING_STATUSES) {
      const b = await seedBooking(w.A, {
        site,
        startsAt: new Date('2026-11-02T07:00:00Z'),
        status,
        dockId: holding.includes(status) ? site.dockIds[holding.indexOf(status)] : null,
        noShowAt: status === 'no_show' ? new Date('2026-11-02T08:00:00Z') : null,
      });
      byStatus.set(status, b.id);
    }
  });

  const input = (name: CommandName): CommandInput => {
    switch (name) {
      case 'reschedule':
        return { type: name, startsAt: '2026-11-02T12:00:00Z', version: 1 };
      case 'update_avis':
        return {
          type: name,
          avis: {
            references: [{ type: 'delivery_note', value: 'LS-1' }],
            counterpartyName: 'Andere GmbH',
            loadUnits: [{ type: 'carton', quantity: 3 }],
          },
          version: 1,
        };
      case 'send_driver_link':
        return { type: name, email: 'driver@example.test', locale: 'ro' };
      case 'turn_away':
        return { type: name, reason: 'other' };
      case 'call':
      case 'dock':
      case 'start_loading':
        return { type: name, dockId: freeDock() };
      case 'complete':
        return { type: name, actualLoadUnits: 9 };
      case 'depart':
        return { type: name, reason: 'Fahrer abgereist' };
      case 'link_acknowledgement':
        return { type: name, acknowledgementId: randomUUID(), via: 'gate_lookup' };
      default:
        return { type: name } as CommandInput;
    }
  };

  for (const name of COMMAND_NAMES) {
    const def: CommandDef = COMMANDS[name];
    const party = def.actors.staff ? 'staff' : 'system';
    const invalid = BOOKING_STATUSES.filter(
      (s) => !sourceStates(name, party).includes(s) && s !== def.to,
    );
    it(`${name} from ${invalid.join(', ')}`, async () => {
      for (const status of invalid) {
        const id = byStatus.get(status) as string;
        const run =
          party === 'staff'
            ? asStaff(w.A, w.A.users.tenant_admin, NOW, (ctx) =>
                transitionBooking(ctx, id, input(name)),
              )
            : asSystem(w.A, NOW, (ctx) => transitionBooking(ctx, id, input(name)));
        expect({ status, ...(await outcome(run)) }).toEqual({
          status,
          code: 'conflict',
          reason: 'invalid_transition',
        });
      }
      expect((await bookingRow(byStatus.get('departed') as never)).version).toBe(1);
    });
  }

  it('answers 403 for a party the table does not name', async () => {
    const id = byStatus.get('confirmed') as string;
    expect(
      await outcome(
        asStaff(w.A, w.A.users.tenant_admin, NOW, (ctx) =>
          transitionBooking(ctx, id, { type: 'mark_no_show' }),
        ),
      ),
    ).toEqual({ code: 'forbidden' });
    expect(
      await outcome(
        asStaff(w.A, w.A.users.dock_operator, NOW, (ctx) =>
          transitionBooking(ctx, w.A.bookings.own.id, { type: 'check_in' }),
        ),
      ),
    ).toEqual({ code: 'forbidden' });
  });
});

describe('idempotent repeats and the event log', () => {
  it('answers a second identical command with 200 and writes no new event', async () => {
    const b = await seedBooking(w.A, { startsAt: new Date('2026-11-03T08:00:00Z') });
    const cancel = () =>
      as(app, w.A.users.dispatcher).post(`/api/t/${w.A.tenantId}/bookings/${b.id}/cancel`, {
        body: { reason: 'Tor gesperrt' },
      });
    expect((await cancel()).status).toBe(200);
    expect((await cancel()).status).toBe(200);
    expect((await eventsOf(b.id)).map((e) => e.type)).toEqual(['cancelled']);
    expect((await bookingRow(b.id)).version).toBe(2);
  });

  it('keeps booking_event append-only under RLS', async () => {
    const b = await seedBooking(w.A, { startsAt: new Date('2026-11-03T09:00:00Z') });
    await asStaff(w.A, w.A.users.dispatcher, NOW, (ctx) =>
      transitionBooking(ctx, b.id, { type: 'cancel' }),
    );
    const scope = {
      party: 'tenant',
      tenantId: w.A.tenantId,
      siteIds: 'all',
      actor: { kind: 'user', userId: w.A.users.tenant_admin.id, role: 'tenant_admin' },
    } as const;
    const updated = await withScope(scope, (tx) =>
      tx
        .update(bookingEvent)
        .set({ type: 'forged' })
        .where(eq(bookingEvent.bookingId, b.id))
        .returning(),
    );
    expect(updated).toEqual([]);
    expect((await eventsOf(b.id)).map((e) => e.type)).toEqual(['cancelled']);
  });

  it('shows actors to tenant admins and hides them from dispatchers (YD-08)', async () => {
    const b = await seedBooking(w.A, { startsAt: new Date('2026-11-03T10:00:00Z') });
    await as(app, w.A.users.dispatcher).post(`/api/t/${w.A.tenantId}/bookings/${b.id}/cancel`, {
      body: {},
    });
    const events = async (user: typeof w.A.users.dispatcher) =>
      (
        (await (
          await as(app, user).get(`/api/t/${w.A.tenantId}/bookings/${b.id}/events`)
        ).json()) as { items: Record<string, unknown>[] }
      ).items;
    const [forAdmin] = await events(w.A.users.tenant_admin);
    expect(forAdmin).toMatchObject({
      type: 'cancelled',
      actor: {
        party: 'tenant',
        userId: w.A.users.dispatcher.id,
        name: expect.stringMatching(/^dispatcher /),
      },
    });
    const [forDispatcher] = await events(w.A.users.dispatcher);
    expect(forDispatcher).toMatchObject({ type: 'cancelled', data: { late: false } });
    expect(forDispatcher).not.toHaveProperty('actor');
    expect(JSON.stringify(forDispatcher)).not.toContain(w.A.users.dispatcher.id);
  });
});

describe('yard commands', () => {
  const gate = <T>(now: Date, fn: Parameters<typeof asStaff<T>>[3]) =>
    asStaff(w.A, w.A.users.gate_operator, now, fn);
  const dockOp = <T>(now: Date, fn: Parameters<typeof asStaff<T>>[3]) =>
    asStaff(w.A, w.A.users.dock_operator, now, fn);
  const [dock1, dock2] = [() => w.A.sites[0].dockIds[0], () => w.A.sites[0].dockIds[1]];

  it('checks a 23:30 no-show in at 00:40 and not on the following day (YD-02)', async () => {
    // Tuesday 2026-11-03 23:30 CET; no-show after 60 minutes is Wednesday 00:30.
    const startsAt = new Date('2026-11-03T22:30:00Z');
    const markedAt = new Date('2026-11-03T23:30:00Z');
    const early = await seedBooking(w.A, { startsAt });
    const late = await seedBooking(w.A, { startsAt });
    for (const b of [early, late]) {
      const r = await asSystem(w.A, markedAt, (ctx) =>
        transitionBooking(ctx, b.id, { type: 'mark_no_show' }),
      );
      expect(r.booking).toMatchObject({ status: 'no_show', noShowAt: markedAt });
    }
    const at0040 = new Date('2026-11-03T23:40:00Z');
    const checkedIn = await gate(at0040, (ctx) =>
      transitionBooking(ctx, early.id, { type: 'check_in', plateSeen: 'hh ab 1' }),
    );
    expect(checkedIn.booking).toMatchObject({
      status: 'checked_in',
      punctuality: 'late',
      punctualityMinutes: 70,
    });
    const nextDay = new Date('2026-11-04T23:10:00Z'); // Thursday 00:10 CET
    expect(
      await outcome(gate(nextDay, (ctx) => transitionBooking(ctx, late.id, { type: 'check_in' }))),
    ).toEqual({ code: 'conflict', reason: 'invalid_transition', status: 'no_show' });
    const [checkInEvent] = (await eventsOf(early.id)).filter((e) => e.type === 'checked_in');
    expect(checkInEvent?.data).toMatchObject({ fromNoShow: true, plateRecorded: true });
    expect(await ownerCount('avis', sql`booking_id = ${early.id} and plate_seen = 'HHAB1'`)).toBe(
      1,
    );
  });

  it('marks no-shows only when due', async () => {
    const b = await seedBooking(w.A, { startsAt: new Date('2026-11-05T08:00:00Z') });
    expect(
      await outcome(
        asSystem(w.A, new Date('2026-11-05T08:59:00Z'), (ctx) =>
          transitionBooking(ctx, b.id, { type: 'mark_no_show' }),
        ),
      ),
    ).toMatchObject({ code: 'conflict', reason: 'not_due' });
  });

  it('computes punctuality against the tolerance and grace settings', async () => {
    const startsAt = new Date('2026-11-06T08:00:00Z');
    const cases = [
      [-31, 'early'],
      [-30, 'on_time'],
      [15, 'on_time'],
      [16, 'late'],
    ] as const;
    for (const [minutes, expected] of cases) {
      const b = await seedBooking(w.A, { startsAt });
      const at = new Date(startsAt.getTime() + minutes * 60_000);
      const r = await gate(at, (ctx) => transitionBooking(ctx, b.id, { type: 'check_in' }));
      expect([minutes, r.booking.punctuality]).toEqual([minutes, expected]);
    }
  });

  it('turns a truck away after check-in and shortens its driver link', async () => {
    const startsAt = new Date('2026-11-07T08:00:00Z');
    const b = await seedBooking(w.A, { startsAt, status: 'checked_in' });
    const at = new Date('2026-11-07T08:20:00Z');
    const r = await gate(at, (ctx) =>
      transitionBooking(ctx, b.id, { type: 'turn_away', reason: 'wrong_load' }),
    );
    expect(r.booking).toMatchObject({ status: 'turned_away', turnAwayReason: 'wrong_load' });
    const expiry = new Date(at.getTime() + 24 * 3_600_000);
    expect(
      await ownerCount('driver_access', sql`booking_id = ${b.id} and expires_at = ${expiry}`),
    ).toBe(1);
  });

  it('frees the dock on uncall, so another truck can be called to it (YD-07)', async () => {
    const first = await seedBooking(w.A, { startsAt: NOW, status: 'checked_in' });
    const second = await seedBooking(w.A, { startsAt: NOW, status: 'checked_in' });
    await dockOp(NOW, (ctx) => transitionBooking(ctx, first.id, { type: 'call', dockId: dock1() }));
    expect(
      await outcome(
        dockOp(NOW, (ctx) => transitionBooking(ctx, second.id, { type: 'call', dockId: dock1() })),
      ),
    ).toEqual({ code: 'conflict', reason: 'dock_occupied' });
    const uncalled = await dockOp(NOW, (ctx) =>
      transitionBooking(ctx, first.id, { type: 'uncall' }),
    );
    expect(uncalled.booking).toMatchObject({ status: 'checked_in', dockId: null, calledAt: null });
    const called = await dockOp(NOW, (ctx) =>
      transitionBooking(ctx, second.id, { type: 'call', dockId: dock1() }),
    );
    expect(called.booking).toMatchObject({ status: 'called', dockId: dock1() });
    await dockOp(NOW, (ctx) =>
      transitionBooking(ctx, second.id, { type: 'complete', actualLoadUnits: 10 }),
    );
  });

  it('rejects a second truck on a dock through the index and still reads afterwards', async () => {
    const holder = await seedBooking(w.A, { startsAt: NOW, status: 'at_dock', dockId: dock2() });
    const other = await seedBooking(w.A, { startsAt: NOW, status: 'checked_in' });
    const afterwards = await dockOp(NOW, async (ctx) => {
      const err = await outcome(
        transitionBooking(ctx, other.id, { type: 'dock', dockId: dock2() }),
      );
      const [row] = await ctx.tx.select().from(booking).where(eq(booking.id, other.id));
      return { err, status: row?.status };
    });
    expect(afterwards).toEqual({
      err: { code: 'conflict', reason: 'dock_occupied' },
      status: 'checked_in',
    });
    await dockOp(NOW, (ctx) =>
      transitionBooking(ctx, holder.id, { type: 'complete', actualLoadUnits: 10 }),
    );
  });

  it('needs a reason to depart before done, and a dock for dock commands', async () => {
    const b = await seedBooking(w.A, { startsAt: NOW, status: 'checked_in' });
    expect(
      await outcome(gate(NOW, (ctx) => transitionBooking(ctx, b.id, { type: 'depart' }))),
    ).toMatchObject({ code: 'validation_failed' });
    expect(
      await outcome(dockOp(NOW, (ctx) => transitionBooking(ctx, b.id, { type: 'dock' }))),
    ).toMatchObject({ code: 'validation_failed' });
  });
});

describe('check-in under safety enforcement (YD-02)', () => {
  it('refuses a missing acknowledgement and checks in once a valid one is linked', async () => {
    const enforced = await world();
    await bookableSite(enforced.A);
    const briefing = await seedBriefing(ownerDb(), enforced.A);
    const b = await seedBooking(enforced.A, { startsAt: NOW });
    const gate = <T>(fn: Parameters<typeof asStaff<T>>[3]) =>
      asStaff(enforced.A, enforced.A.users.gate_operator, NOW, fn);
    expect(
      await outcome(gate((ctx) => transitionBooking(ctx, b.id, { type: 'check_in' }))),
    ).toEqual({
      code: 'conflict',
      reason: 'safety_missing',
      instructionIds: [briefing.instructionId],
    });
    const linked = await gate((ctx) =>
      transitionBooking(ctx, b.id, {
        type: 'link_acknowledgement',
        acknowledgementId: briefing.acknowledgementId,
        via: 'gate_lookup',
      }),
    );
    expect(linked.changed).toBe(true);
    const r = await gate((ctx) => transitionBooking(ctx, b.id, { type: 'check_in' }));
    expect(r.booking.status).toBe('checked_in');
    expect((await eventsOf(b.id)).map((e) => [e.type, e.data])).toEqual([
      [
        'safety_linked',
        {
          instructionId: briefing.instructionId,
          acknowledgementId: briefing.acknowledgementId,
          via: 'gate_lookup',
        },
      ],
      ['checked_in', expect.objectContaining({ safety: 'valid' })],
    ]);
  });

  it('refuses to link an expired acknowledgement', async () => {
    const enforced = await world();
    const briefing = await seedBriefing(ownerDb(), enforced.A);
    await ownerDb()
      .update(safetyAcknowledgement)
      .set({ expiresAt: new Date('2026-11-01T00:00:00Z') })
      .where(eq(safetyAcknowledgement.id, briefing.acknowledgementId));
    const b = await seedBooking(enforced.A, { startsAt: NOW });
    expect(
      await outcome(
        asStaff(enforced.A, enforced.A.users.gate_operator, NOW, (ctx) =>
          transitionBooking(ctx, b.id, {
            type: 'link_acknowledgement',
            acknowledgementId: briefing.acknowledgementId,
            via: 'gate_lookup',
          }),
        ),
      ),
    ).toEqual({ code: 'conflict', reason: 'acknowledgement_invalid', status: 'expired' });
  });
});
