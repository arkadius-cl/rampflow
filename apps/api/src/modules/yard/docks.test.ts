import type { BookingEventView } from '@rampflow/shared/modules/booking/api.staff';
import type { CallResult, DocksView, YardTruck } from '@rampflow/shared/modules/yard/api';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../test/db.ts';
import { as } from '../../../test/http.ts';
import { type World, type WorldSide, type WorldUser, world } from '../../../test/world.ts';
import { createApp } from '../../app.ts';
import type { DockId } from '../../db/ids.ts';
import { testClock } from '../../kernel/clock.ts';
import { bookableSite, bookingRow, seedBooking } from '../booking/lifecycle/fixtures.ts';
import { dock, hall } from '../core/schema.ts';

// Dock station (YD-06 to YD-08), through the HTTP routes.

const MON_0900 = '2026-11-02T08:00:00.000Z';
const app = createApp({ clock: testClock(new Date('2026-11-02T08:30:00.000Z')) });
const yard = (side: WorldSide) => `/api/t/${side.tenantId}/yard`;
const json = async <T>(res: Response, status = 200): Promise<T> => {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
};

let w: World;
let outside: DockId;
let maintenance: DockId;
beforeAll(async () => {
  w = await world();
  await bookableSite(w.A);
  const s = w.A.sites[0];
  const [hall2] = await ownerDb()
    .insert(hall)
    .values({ tenantId: w.A.tenantId, siteId: s.id, name: 'Hall 2', sort: 1 })
    .returning({ id: hall.id });
  const extra = await ownerDb()
    .insert(dock)
    .values(
      (['active', 'maintenance', 'inactive'] as const).map((status, i) => ({
        tenantId: w.A.tenantId,
        siteId: s.id,
        hallId: hall2?.id as string,
        code: `B-0${i + 1}`,
        doorType: 'dock_leveler' as const,
        temperatureZone: 'chilled' as const,
        status,
      })),
    )
    .returning({ id: dock.id });
  outside = extra[0]?.id as DockId;
  maintenance = extra[1]?.id as DockId;
});

const post = (user: WorldUser, path: string, body: unknown = {}) =>
  as(app, user).post(`${yard(w.A)}/bookings/${path}`, { body });
const docks = async (user = w.A.users.dock_operator) =>
  json<DocksView>(await as(app, user).get(`${yard(w.A)}/docks?siteId=${w.A.sites[0].id}`));
const checkedIn = (startsAt: string) =>
  seedBooking(w.A, { startsAt: new Date(startsAt), status: 'checked_in' });

describe('YD-06 dock overview', () => {
  it('groups active and maintenance docks by hall and queues checked-in trucks by slot start', async () => {
    const late = await checkedIn('2026-11-02T09:00:00.000Z');
    const early = await checkedIn('2026-11-02T07:30:00.000Z');
    const view = await docks();
    expect(view.halls.map((h) => [h.name, h.docks.map((d) => [d.code, d.status])])).toEqual([
      [
        'Hall 1',
        [
          ['D-01', 'active'],
          ['D-02', 'active'],
        ],
      ],
      [
        'Hall 2',
        [
          ['B-01', 'active'],
          ['B-02', 'maintenance'],
        ],
      ],
    ]);
    const queue = view.queue.map((t) => t.id);
    expect(queue.indexOf(early.id)).toBeLessThan(queue.indexOf(late.id));
    for (const id of [early.id, late.id])
      await post(w.A.users.gate_operator, `${id}/depart`, { reason: 'test' });
  });
});

describe('YD-07 assign and call', () => {
  it('lets one of two operators calling different trucks to one dock win; the other gets 409 dock_occupied', async () => {
    const [a, b] = [await checkedIn(MON_0900), await checkedIn(MON_0900)];
    const target = w.A.sites[0].dockIds[0];
    const [r1, r2] = await Promise.all([
      post(w.A.users.dock_operator, `${a?.id}/call`, { dockId: target }),
      post(w.A.users.gate_operator, `${b?.id}/call`, { dockId: target }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(await loser.json()).toMatchObject({
      error: { code: 'conflict', details: { reason: 'dock_occupied' } },
    });
    const view = await docks();
    const occupied = view.halls[0]?.docks.find((d) => d.id === target)?.occupant;
    expect([a?.id, b?.id]).toContain(occupied?.id);
    expect(occupied).toMatchObject({ status: 'called', dock: { code: 'D-01', hall: 'Hall 1' } });
    const winner = occupied?.id as string;
    const waiting = winner === a?.id ? b : a;
    await post(w.A.users.dock_operator, `${winner}/uncall`);
    await post(w.A.users.gate_operator, `${winner}/depart`, { reason: 'test' });
    await post(w.A.users.gate_operator, `${waiting?.id}/depart`, { reason: 'test' });
  });

  it('warns for a dock outside the pool and refuses a dock in maintenance', async () => {
    const b = await checkedIn(MON_0900);
    const inPool = await json<CallResult>(
      await post(w.A.users.dock_operator, `${b.id}/call`, { dockId: w.A.sites[0].dockIds[1] }),
    );
    expect(inPool.outsideResource).toBe(false);
    const moved = await json<CallResult>(
      await post(w.A.users.dock_operator, `${b.id}/call`, { dockId: outside }),
    );
    expect(moved).toMatchObject({
      outsideResource: true,
      truck: { status: 'called', dock: { code: 'B-01', hall: 'Hall 2' } },
    });
    const refused = await post(w.A.users.dock_operator, `${b.id}/call`, { dockId: maintenance });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { details: { reason: 'dock_inactive' } } });
    await post(w.A.users.gate_operator, `${b.id}/depart`, { reason: 'test' });
  });

  it('"Cancel call" frees the dock and returns the truck to the queue', async () => {
    const b = await checkedIn(MON_0900);
    const dockId = w.A.sites[0].dockIds[0];
    await json(await post(w.A.users.dock_operator, `${b.id}/call`, { dockId }));
    expect((await docks()).queue.map((t) => t.id)).not.toContain(b.id);
    const truck = await json<YardTruck>(await post(w.A.users.dock_operator, `${b.id}/uncall`));
    expect(truck).toMatchObject({ status: 'checked_in', dock: null, calledAt: null });
    const view = await docks();
    expect(view.queue.map((t) => t.id)).toContain(b.id);
    expect(view.halls[0]?.docks.find((d) => d.id === dockId)?.occupant).toBeNull();
    await post(w.A.users.gate_operator, `${b.id}/depart`, { reason: 'test' });
  });
});

describe('YD-08 dock progress', () => {
  it('sets one state per tap, leaves skipped timestamps empty, and done frees the dock', async () => {
    const b = await checkedIn(MON_0900);
    const dockId = w.A.sites[0].dockIds[1];
    const dockOp = w.A.users.dock_operator;
    expect((await post(dockOp, `${b.id}/loading`)).status).toBe(422);
    const loading = await json<YardTruck>(await post(dockOp, `${b.id}/loading`, { dockId }));
    expect(loading).toMatchObject({ status: 'loading', dock: { code: 'D-02' } });
    expect((await post(dockOp, `${b.id}/complete`, { actualLoadUnits: -1 })).status).toBe(422);
    const done = await json<YardTruck>(
      await post(dockOp, `${b.id}/complete`, {
        actualLoadUnits: 9,
        discrepancyNote: 'One pallet damaged',
      }),
    );
    expect(done).toMatchObject({ status: 'done', calledAt: null, atDockAt: null });
    expect(done.loadingAt).not.toBeNull();
    expect(await bookingRow(b.id)).toMatchObject({
      actualLoadUnits: 9,
      discrepancyNote: 'One pallet damaged',
      calledAt: null,
      atDockAt: null,
    });
    const view = await docks();
    expect(view.halls[0]?.docks.find((d) => d.id === dockId)?.occupant).toBeNull();
    // The dock is free for the next truck at once.
    const next = await checkedIn(MON_0900);
    expect((await post(dockOp, `${next.id}/dock`, { dockId })).status).toBe(200);
  });

  it('shows the event log with actors to tenant admins only', async () => {
    const b = await checkedIn(MON_0900);
    await json(await post(w.A.users.dock_operator, `${b.id}/call`, { dockId: outside }));
    await json(await post(w.A.users.dock_operator, `${b.id}/dock`));
    const events = async (user: WorldUser) =>
      (
        await json<{ items: BookingEventView[] }>(
          await as(app, user).get(`/api/t/${w.A.tenantId}/bookings/${b.id}/events`),
        )
      ).items;
    const forAdmin = await events(w.A.users.tenant_admin);
    expect(forAdmin.map((e) => e.type)).toEqual(['called', 'at_dock']);
    expect(forAdmin[0]?.actor).toMatchObject({
      party: 'tenant',
      userId: w.A.users.dock_operator.id,
    });
    const forDispatcher = await events(w.A.users.dispatcher);
    expect(forDispatcher.map((e) => e.type)).toEqual(['called', 'at_dock']);
    expect(forDispatcher.every((e) => e.actor === undefined)).toBe(true);
  });

  it('refuses dock progress to a gate operator, who calls but does not work the dock', async () => {
    const b = await checkedIn(MON_0900);
    const res = await post(w.A.users.gate_operator, `${b.id}/dock`, {
      dockId: w.A.sites[0].dockIds[0],
    });
    expect(res.status).toBe(403);
  });
});
