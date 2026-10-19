import { randomUUID } from 'node:crypto';
import { AvisInput } from '@rampflow/shared/modules/avis/avis';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerCount } from '../../../../test/db.ts';
import { type World, world } from '../../../../test/world.ts';
import type { BookingId } from '../../../db/ids.ts';
import { createBooking } from './create.ts';
import { asStaff, avisInput, bookableSite, bookingRow, eventsOf } from './fixtures.ts';
import { transitionBooking } from './transition.ts';

// The core loop at service level (delivery plan, U6a): booking, yard commands and the KPI
// columns of RP-01 meet here two waves before U12 drives them through the UI.

let w: World;
beforeAll(async () => {
  w = await world();
  await bookableSite(w.A);
});

const at = (iso: string) => new Date(iso);

describe('core loop: create, check in, call, uncall, call, dock, load, complete, depart', () => {
  it('stamps the KPI columns and writes one event per step', async () => {
    const { A } = w;
    const [dock1, dock2] = A.sites[0].dockIds;
    const created = await asStaff(A, A.users.dispatcher, at('2026-10-19T08:00:00Z'), (ctx) =>
      createBooking(ctx, {
        mode: 'staff',
        clientRequestId: randomUUID(),
        siteId: A.sites[0].id,
        loadTypeId: A.sites[0].loadTypeId,
        // Monday 2026-11-02, 09:00 CET.
        startsAt: at('2026-11-02T08:00:00Z'),
        carrier: { id: A.carrierId },
        avis: AvisInput.parse(avisInput({ vehicle: { plate: 'PO 12345' } })),
      }),
    );
    const id = created.booking.id as BookingId;
    const step = (
      user: keyof typeof A.users,
      now: string,
      run: Parameters<typeof transitionBooking>[2],
    ) => asStaff(A, A.users[user], at(now), (ctx) => transitionBooking(ctx, id, run));

    await step('gate_operator', '2026-11-02T07:50:00Z', { type: 'check_in', plateSeen: 'PO12345' });
    await step('dock_operator', '2026-11-02T07:55:00Z', { type: 'call', dockId: dock1 });
    await step('dock_operator', '2026-11-02T08:00:00Z', { type: 'uncall' });
    await step('gate_operator', '2026-11-02T08:02:00Z', { type: 'call', dockId: dock2 });
    await step('dock_operator', '2026-11-02T08:05:00Z', { type: 'dock' });
    await step('dock_operator', '2026-11-02T08:10:00Z', { type: 'start_loading' });
    await step('dock_operator', '2026-11-02T08:50:00Z', {
      type: 'complete',
      actualLoadUnits: 9,
      discrepancyNote: 'Eine Palette fehlt',
    });
    await step('gate_operator', '2026-11-02T09:00:00Z', { type: 'depart' });

    expect(await bookingRow(id)).toMatchObject({
      status: 'departed',
      punctuality: 'on_time',
      punctualityMinutes: -10,
      checkedInAt: at('2026-11-02T07:50:00Z'),
      calledAt: at('2026-11-02T08:02:00Z'),
      atDockAt: at('2026-11-02T08:05:00Z'),
      loadingAt: at('2026-11-02T08:10:00Z'),
      doneAt: at('2026-11-02T08:50:00Z'),
      departedAt: at('2026-11-02T09:00:00Z'),
      dockId: dock2,
      actualLoadUnits: 9,
      discrepancyNote: 'Eine Palette fehlt',
      departureReason: null,
      noShowAt: null,
      cancelledAt: null,
      version: 9,
    });
    const events = await eventsOf(id);
    expect(events.map((e) => [e.type, e.fromStatus, e.toStatus])).toEqual([
      ['created', null, 'confirmed'],
      ['checked_in', 'confirmed', 'checked_in'],
      ['called', 'checked_in', 'called'],
      ['uncalled', 'called', 'checked_in'],
      ['called', 'checked_in', 'called'],
      ['at_dock', 'called', 'at_dock'],
      ['loading_started', 'at_dock', 'loading'],
      ['done', 'loading', 'done'],
      ['departed', 'done', 'departed'],
    ]);
    expect(events.find((e) => e.type === 'done')?.data).toEqual({
      dockId: dock2,
      actualLoadUnits: 9,
      discrepancy: true,
    });
    expect(events.every((e) => e.actorParty === 'tenant' && e.actorUserId !== null)).toBe(true);
    // Departure: min(departed_at + 24 h, starts_at + 7 days).
    expect(
      await ownerCount(
        'driver_access',
        sql`booking_id = ${id} and expires_at = ${at('2026-11-03T09:00:00Z')}`,
      ),
    ).toBe(1);
  });
});
