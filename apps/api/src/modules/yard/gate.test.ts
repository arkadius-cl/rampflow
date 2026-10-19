import { randomUUID } from 'node:crypto';
import type {
  CandidatesView,
  DocksView,
  ExpectedView,
  OnSiteView,
  SearchView,
  WalkInResult,
  YardTruck,
} from '@rampflow/shared/modules/yard/api';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../test/db.ts';
import { as } from '../../../test/http.ts';
import { type World, type WorldSide, type WorldUser, world } from '../../../test/world.ts';
import { createApp } from '../../app.ts';
import type { BookingId } from '../../db/ids.ts';
import { testClock } from '../../kernel/clock.ts';
import { avis, avisReference } from '../avis/schema.ts';
import {
  avisInput,
  bookableSite,
  bookingRow,
  eventsOf,
  seedBooking,
  setSetting,
} from '../booking/lifecycle/fixtures.ts';
import { driverAccess } from '../driver/schema.ts';
import { briefingOf, seedBriefing } from '../safety/authoring/fixtures.ts';

// Gate station (YD-01 to YD-05, the gate side of BK-02 walk-in), through the HTTP routes.

const MON_0900 = '2026-11-02T08:00:00.000Z';
const at = (now: string, user: WorldUser) =>
  as(createApp({ clock: testClock(new Date(now)) }), user);
const yard = (side: WorldSide) => `/api/t/${side.tenantId}/yard`;
const json = async <T>(res: Response, status = 200): Promise<T> => {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
};
const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

const checkIn = (side: WorldSide, id: string, now: string, plateSeen: string | null = null) =>
  at(now, side.users.gate_operator).post(`${yard(side)}/bookings/${id}/check-in`, {
    body: { plateSeen },
  });

describe('YD-01 expected trucks and search', () => {
  let w: World;
  let ids: { early: BookingId; later: BookingId; otherDay: BookingId; noShow: BookingId };

  beforeAll(async () => {
    w = await world();
    const early = await seedBooking(w.A, { startsAt: new Date('2026-11-02T07:30:00Z') });
    const later = await seedBooking(w.A, { startsAt: new Date('2026-11-02T12:00:00Z') });
    const otherDay = await seedBooking(w.A, { startsAt: new Date('2026-11-03T08:00:00Z') });
    // A 23:30 slot of Sunday, marked no-show at 00:30 on Monday: it belongs to Monday's gate.
    const noShow = await seedBooking(w.A, {
      startsAt: new Date('2026-11-01T22:30:00Z'),
      status: 'no_show',
      noShowAt: new Date('2026-11-01T23:30:00Z'),
    });
    ids = { early: early.id, later: later.id, otherDay: otherDay.id, noShow: noShow.id };
    const db = ownerDb();
    await db.update(avis).set({ plate: 'HHAB123' }).where(eq(avis.bookingId, later.id));
    await db.update(avis).set({ plateSeen: 'WX4711' }).where(eq(avis.bookingId, early.id));
    await db.insert(avisReference).values({
      bookingId: later.id,
      tenantId: w.A.tenantId,
      siteId: w.A.sites[0].id,
      carrierId: w.A.carrierId,
      type: 'delivery_note',
      value: 'ls-99812',
      valueNorm: 'LS-99812',
    });
  });

  const expected = async (date?: string) =>
    json<ExpectedView>(
      await at(MON_0900, w.A.users.gate_operator).get(
        `${yard(w.A)}/expected?siteId=${w.A.sites[0].id}${date ? `&date=${date}` : ''}`,
      ),
    );

  it("lists the site-local day's bookings by start, with the no-show marked that day", async () => {
    const view = await expected();
    expect(view).toMatchObject({ date: '2026-11-02', timeZone: 'Europe/Berlin' });
    const mine = view.items
      .map((t) => t.id)
      .filter((id) => Object.values(ids).includes(id as BookingId));
    expect(mine).toEqual([ids.noShow, ids.early, ids.later]);
    const later = view.items.find((t) => t.id === ids.later);
    expect(later).toMatchObject({
      carrierName: 'Spedition Nowak',
      plate: 'HHAB123',
      loadUnits: 10,
      loadType: { name: { en: 'Pallets' } },
      safety: { status: 'not_required' },
      punctuality: 'early',
      punctualityMinutes: -240,
    });
    expect(view.items.find((t) => t.id === ids.noShow)?.punctuality).toBe('late');
    expect((await expected('2026-11-03')).items.map((t) => t.id)).toContain(ids.otherDay);
  });

  const search = async (q: string) =>
    (
      await json<SearchView>(
        await at(MON_0900, w.A.users.gate_operator).post(`${yard(w.A)}/search`, {
          body: { siteId: w.A.sites[0].id, q },
        }),
      )
    ).items.map((t) => t.id);

  it('finds a booking by the code a scanner types, by plate, reference and carrier', async () => {
    const code = (await bookingRow(ids.later)).code;
    expect(await search(` ${code.toLowerCase()}\n`)).toEqual([ids.later]);
    expect(await search('hh-ab 123')).toEqual([ids.later]);
    expect(await search('WX 4711')).toEqual([ids.early]);
    expect(await search('ls-99812')).toEqual([ids.later]);
    const byCarrier = await search('nowak');
    expect(byCarrier).toEqual(expect.arrayContaining([ids.early, ids.later, ids.noShow]));
    expect(byCarrier.indexOf(ids.early)).toBeLessThan(byCarrier.indexOf(ids.otherDay));
  });

  it('answers 422 for a search term of one character', async () => {
    const res = await at(MON_0900, w.A.users.gate_operator).post(`${yard(w.A)}/search`, {
      body: { siteId: w.A.sites[0].id, q: 'a' },
    });
    expect(res.status).toBe(422);
  });
});

describe('YD-02 check in', () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
  });

  const fresh = (startsAt = MON_0900) => seedBooking(w.A, { startsAt: new Date(startsAt) });
  const minutesAfter = (iso: string, m: number) =>
    new Date(new Date(iso).getTime() + m * 60_000).toISOString();

  it.each([
    [-31, 'early'],
    [-30, 'on_time'],
    [15, 'on_time'],
    [16, 'late'],
  ] as const)('records punctuality at %i minutes as %s (tolerance 30, grace 15)', async (m, p) => {
    const b = await fresh();
    const truck = await json<YardTruck>(
      await checkIn(w.A, b.id, minutesAfter(MON_0900, m), 'hh ab 1'),
    );
    expect(truck).toMatchObject({ status: 'checked_in', punctuality: p, punctualityMinutes: m });
    expect(truck.plate).toBe('HHAB1');
  });

  it('uses the site setting of the tolerance and grace', async () => {
    const by = w.A.users.tenant_admin.id;
    await setSetting(w.A.tenantId, 'yard.grace_minutes', 5, by, w.A.sites[0].id);
    const b = await fresh('2026-11-02T10:00:00.000Z');
    const truck = await json<YardTruck>(await checkIn(w.A, b.id, '2026-11-02T10:06:00.000Z'));
    expect(truck.punctuality).toBe('late');
  });

  it('turns away only with a listed reason, also after check-in', async () => {
    const b = await fresh();
    const gate = at(MON_0900, w.A.users.gate_operator);
    const url = `${yard(w.A)}/bookings/${b.id}/turn-away`;
    expect((await gate.post(url, { body: { reason: 'bad weather' } })).status).toBe(422);
    await json(await checkIn(w.A, b.id, MON_0900));
    const truck = await json<YardTruck>(await gate.post(url, { body: { reason: 'wrong_load' } }));
    expect(truck).toMatchObject({ status: 'turned_away' });
    expect((await bookingRow(b.id)).turnAwayReason).toBe('wrong_load');
  });

  it('checks in a no-show on the site-local day of no_show_at, across the DST change, not the day after', async () => {
    // Saturday 24 Oct 2026, 23:30 CEST; no-show at Sunday 00:30 CEST. Sunday has 25 hours.
    const seed = () =>
      seedBooking(w.A, {
        startsAt: new Date('2026-10-24T21:30:00Z'),
        status: 'no_show',
        noShowAt: new Date('2026-10-24T22:30:00Z'),
      });
    const sameDay = await seed();
    // Sunday 23:45 CET is 24 h 15 min after no_show_at, still that site-local day.
    const truck = await json<YardTruck>(await checkIn(w.A, sameDay.id, '2026-10-25T22:45:00.000Z'));
    expect(truck).toMatchObject({ status: 'checked_in', punctuality: 'late' });
    const nextDay = await seed();
    const res = await checkIn(w.A, nextDay.id, '2026-10-25T23:10:00.000Z');
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({ details: { reason: 'invalid_transition' } });
  });
});

describe('YD-02 safety at the gate', () => {
  let pro: World;
  let start: World;
  beforeAll(async () => {
    pro = await world();
    start = await world({ packages: { A: 'start' } });
    await seedBriefing(ownerDb(), pro.A);
    await seedBriefing(ownerDb(), start.A);
  });

  it('with gate enforcement (Pro) refuses check-in until the briefing found by driver name is linked', async () => {
    const b = await seedBooking(pro.A, { startsAt: new Date(MON_0900) });
    const refused = await checkIn(pro.A, b.id, MON_0900);
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toMatchObject({
      details: { reason: 'safety_missing', instructionIds: [briefingOf(pro.A).instructionId] },
    });
    const gate = at(MON_0900, pro.A.users.gate_operator);
    const base = `${yard(pro.A)}/bookings/${b.id}`;
    const { items } = await json<CandidatesView>(
      await gate.post(`${base}/acknowledgement-candidates`, {
        body: { name: pro.A.bookings.own.code.toLowerCase() },
      }),
    );
    expect(items.map((i) => i.id)).toEqual([briefingOf(pro.A).acknowledgementId]);
    const linked = await json<YardTruck>(
      await gate.post(`${base}/acknowledgements`, { body: { acknowledgementId: items[0]?.id } }),
    );
    expect(linked.safety).toEqual({ status: 'valid', enforced: true });
    expect((await eventsOf(b.id)).at(-1)).toMatchObject({
      type: 'safety_linked',
      data: { via: 'gate_lookup' },
    });
    expect((await json<YardTruck>(await checkIn(pro.A, b.id, MON_0900))).status).toBe('checked_in');
  });

  it('without it (Start) checks in with the briefing missing as a warning', async () => {
    const b = await seedBooking(start.A, { startsAt: new Date(MON_0900) });
    const truck = await json<YardTruck>(await checkIn(start.A, b.id, MON_0900));
    expect(truck).toMatchObject({
      status: 'checked_in',
      safety: { status: 'missing', enforced: false },
    });
    expect((await eventsOf(b.id)).at(-1)?.data).toMatchObject({ safety: 'missing_warned' });
  });

  it('issues a 30-minute staff driver session for the briefing on the gate device', async () => {
    const b = await seedBooking(pro.A, { startsAt: new Date(MON_0900) });
    const res = await at(MON_0900, pro.A.users.gate_operator).post(
      `${yard(pro.A)}/bookings/${b.id}/briefing-session`,
    );
    const session = await json<{ url: string; expiresAt: string }>(res);
    expect(session.url).toMatch(/\/d#.+/);
    expect(session.expiresAt).toBe('2026-11-02T08:30:00.000Z');
    const rows = await ownerDb()
      .select({ channel: driverAccess.channel })
      .from(driverAccess)
      .where(eq(driverAccess.bookingId, b.id));
    expect(rows.map((r) => r.channel).sort()).toEqual(['link', 'staff']);
  });
});

describe('YD-03 walk-in', () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
    // Open only on Tuesdays: Monday morning is outside the opening hours.
    await bookableSite(w.A, ownerDb(), [[2, '08:00', '16:00']]);
  });

  const walkIn = (body: Record<string, unknown>, now = MON_0900) =>
    at(now, w.A.users.gate_operator).post(`${yard(w.A)}/walk-ins`, {
      body: {
        clientRequestId: randomUUID(),
        siteId: w.A.sites[0].id,
        loadTypeId: w.A.sites[0].loadTypeId,
        carrier: { name: 'Fremdspedition Kowalski' },
        plateSeen: 'po 12345',
        ...body,
      },
    });

  it('lets a gate operator check in an unbooked truck while closed and at a full slot', async () => {
    for (let i = 0; i < 2; i++) await seedBooking(w.A, { startsAt: new Date(MON_0900) });
    const result = await json<WalkInResult>(
      await walkIn({ outcome: 'check_in', avis: avisInput() }, '2026-11-02T08:07:00.000Z'),
      201,
    );
    expect(result.truck).toMatchObject({
      status: 'checked_in',
      walkIn: true,
      startsAt: MON_0900,
      plate: 'PO12345',
      punctuality: null,
    });
    const row = await bookingRow(result.truck.id as BookingId);
    expect(row).toMatchObject({ walkIn: true, createdParty: 'staff' });
  });

  it('records an unbooked truck that is turned away', async () => {
    const result = await json<WalkInResult>(
      await walkIn({ outcome: 'turn_away', reason: 'no_capacity' }),
      201,
    );
    expect(result.truck).toMatchObject({ status: 'turned_away', walkIn: true, plate: 'PO12345' });
    const missing = await walkIn({ outcome: 'turn_away' });
    expect(missing.status).toBe(422);
    const noAvis = await walkIn({ outcome: 'check_in' });
    expect(noAvis.status).toBe(422);
  });

  it('under safety enforcement keeps a walk-in without a briefing confirmed with "Briefing missing"', async () => {
    await seedBriefing(ownerDb(), w.A);
    const result = await json<WalkInResult>(
      await walkIn({ outcome: 'check_in', avis: avisInput() }),
      201,
    );
    expect(result).toMatchObject({
      safety: 'missing',
      truck: { status: 'confirmed', safety: { status: 'missing', enforced: true } },
    });
    const view = await json<ExpectedView>(
      await at(MON_0900, w.A.users.gate_operator).get(
        `${yard(w.A)}/expected?siteId=${w.A.sites[0].id}`,
      ),
    );
    expect(view.items.find((t) => t.id === result.truck.id)?.status).toBe('confirmed');
  });

  it('refuses a dock operator, who holds neither yard.gate nor booking.walk_in', async () => {
    const res = await at(MON_0900, w.A.users.dock_operator).post(`${yard(w.A)}/walk-ins`, {
      body: {
        clientRequestId: randomUUID(),
        siteId: w.A.sites[0].id,
        loadTypeId: w.A.sites[0].loadTypeId,
        carrier: { name: 'X' },
        plateSeen: 'X1',
        outcome: 'turn_away',
        reason: 'other',
      },
    });
    expect(res.status).toBe(403);
  });
});

describe('YD-04 on site and YD-05 check out', () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
  });

  const onSite = async (now: string) =>
    json<OnSiteView>(
      await at(now, w.A.users.gate_operator).get(`${yard(w.A)}/on-site?siteId=${w.A.sites[0].id}`),
    );

  it('flags a truck above yard.standgeld_flag_minutes, not at it, to the second', async () => {
    const b = await seedBooking(w.A, { startsAt: new Date(MON_0900) });
    await json(await checkIn(w.A, b.id, '2026-11-02T07:50:00.000Z'));
    const atLimit = (await onSite('2026-11-02T09:50:00.000Z')).items.find((t) => t.id === b.id);
    expect(atLimit).toMatchObject({ onSiteMinutes: 120, waitMinutes: 110, standgeld: false });
    const view = await onSite('2026-11-02T09:50:30.000Z');
    expect(view.standgeldMinutes).toBe(120);
    expect(view.items.find((t) => t.id === b.id)?.standgeld).toBe(true);
  });

  it.each(['checked_in', 'called', 'at_dock', 'loading'] as const)(
    'departs from %s only with a reason and shortens the driver link',
    async (status) => {
      const holds = status !== 'checked_in';
      const b = await seedBooking(w.A, {
        startsAt: new Date(MON_0900),
        status,
        dockId: holds ? w.A.sites[0].dockIds[0] : null,
      });
      const gate = at('2026-11-02T10:00:00.000Z', w.A.users.gate_operator);
      const url = `${yard(w.A)}/bookings/${b.id}/depart`;
      expect((await gate.post(url, { body: {} })).status).toBe(422);
      const truck = await json<YardTruck>(await gate.post(url, { body: { reason: 'Left early' } }));
      expect(truck).toMatchObject({ status: 'departed', departedAt: '2026-11-02T10:00:00.000Z' });
      const docks = await json<DocksView>(
        await gate.get(`${yard(w.A)}/docks?siteId=${w.A.sites[0].id}`),
      );
      const dock0 = docks.halls[0]?.docks.find((d) => d.id === w.A.sites[0].dockIds[0]);
      expect(dock0?.occupant).toBeNull();
    },
  );

  it('departs from done without a reason; the link expires driver_link_hours later', async () => {
    const b = await seedBooking(w.A, { startsAt: new Date(MON_0900), status: 'done' });
    const truck = await json<YardTruck>(
      await at('2026-11-02T10:00:00.000Z', w.A.users.gate_operator).post(
        `${yard(w.A)}/bookings/${b.id}/depart`,
        { body: {} },
      ),
    );
    expect(truck.status).toBe('departed');
    const [link] = await ownerDb()
      .select({ expiresAt: driverAccess.expiresAt })
      .from(driverAccess)
      .where(eq(driverAccess.bookingId, b.id));
    expect(link?.expiresAt.toISOString()).toBe('2026-11-03T10:00:00.000Z');
    expect((await onSite('2026-11-02T10:01:00.000Z')).items.map((t) => t.id)).not.toContain(b.id);
  });
});
