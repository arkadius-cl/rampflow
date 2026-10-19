import type { LocalDate } from '@rampflow/shared/time';
import { eq, inArray } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { type DockId, wrapJson } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { entitlementOverride } from '../../core/schema.ts';
import { booking } from '../schema.ts';
import { asTenantAdmin, capacitySite, placeBooking } from './fixtures.ts';
import { loadDayTimeline } from './load.ts';
import { isOverCapacity } from './timeline.ts';

const app = createApp({ clock: testClock(new Date('2026-10-19T08:00:00Z')) });

let w: World;
beforeAll(async () => {
  w = await world();
});

const capacity = (side: World['A']) => `/api/t/${side.tenantId}/capacity`;
const admin = (side: World['A']) => as(app, side.users.tenant_admin);
const error = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

const switchOff = (side: World['A'], key: string) =>
  ownerDb()
    .insert(entitlementOverride)
    .values({
      tenantId: side.tenantId,
      key,
      value: wrapJson(false),
      updatedBy: w.platformAdmin.id,
    });

describe('MD-03 bookable resources', () => {
  it('answers 409 dock_in_resource for a dock that already belongs to a resource', async () => {
    const s = w.A.sites[0];
    const first = await admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: {
        siteId: s.id,
        kind: 'single',
        name: 'Tor 1',
        directions: ['inbound'],
        dockIds: [s.dockIds[0]],
      },
    });
    expect(first.status).toBe(201);
    const second = await admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: {
        siteId: s.id,
        kind: 'pool',
        name: 'Pool',
        directions: ['outbound'],
        dockIds: [...s.dockIds],
      },
    });
    expect(second.status).toBe(409);
    expect(await error(second)).toMatchObject({
      code: 'conflict',
      details: { reason: 'dock_in_resource', dockIds: [s.dockIds[0]] },
    });
    const put = await admin(w.A).put(`${capacity(w.A)}/resources/${s.resourceId}/docks`, {
      body: { dockIds: [s.dockIds[0]] },
    });
    expect(put.status).toBe(409);
  });

  it('holds exactly one dock in a single resource and only docks of its own site', async () => {
    const s = w.A.sites[1];
    const two = await admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: {
        siteId: s.id,
        kind: 'single',
        name: 'Tor',
        directions: ['inbound'],
        dockIds: [...s.dockIds],
      },
    });
    expect(two.status).toBe(422);
    const foreignDock = await admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: {
        siteId: s.id,
        kind: 'single',
        name: 'Tor',
        directions: ['inbound'],
        dockIds: [w.A.sites[0].dockIds[1]],
      },
    });
    expect(foreignDock.status).toBe(422);
    expect((await error(foreignDock)).details?.issues).toEqual([
      expect.objectContaining({ path: ['dockIds', 0] }),
    ]);
  });

  it('needs booking.pools to create a pool, while existing pools keep offering times', async () => {
    const side = w.B;
    const s = await capacitySite(side.tenantId, { docks: 2, hours: [[1, '06:00', '10:00']] });
    await switchOff(side, 'booking.pools');
    const res = await admin(side).post(`${capacity(side)}/resources`, {
      body: {
        siteId: side.sites[0].id,
        kind: 'pool',
        name: 'Neu',
        directions: ['inbound'],
        dockIds: [side.sites[0].dockIds[0]],
      },
    });
    expect(res.status).toBe(403);
    expect(await error(res)).toMatchObject({
      code: 'entitlement_required',
      details: { key: 'booking.pools' },
    });
    const patch = await admin(side).patch(`${capacity(side)}/resources/${s.resourceId}`, {
      body: { capacityCap: 1 },
    });
    expect(patch.status).toBe(403);
    const single = await admin(side).post(`${capacity(side)}/resources`, {
      body: {
        siteId: side.sites[0].id,
        kind: 'single',
        name: 'Tor',
        directions: ['inbound'],
        dockIds: [side.sites[0].dockIds[0]],
      },
    });
    expect(single.status).toBe(201);

    const offers = await as(app, side.users.dispatcher).get(
      `${capacity(side)}/availability?siteId=${s.siteId}&date=2026-11-02&loadTypeId=${s.loadTypeId}`,
    );
    expect(offers.status).toBe(200);
    const body = (await offers.json()) as { starts: { wallTime: string }[] };
    expect(body.starts.map((x) => x.wallTime)).toEqual([
      '06:00',
      '06:30',
      '07:00',
      '07:30',
      '08:00',
      '08:30',
      '09:00',
    ]);
  });

  it('lowering capacity cancels nothing and flags the affected bookings', async () => {
    const s = await capacitySite(w.A.tenantId, { docks: 2, hours: [[1, '06:00', '14:00']] });
    const at = new Date('2026-11-02T08:00:00Z');
    const ids = [await placeBooking(s, at, 60), await placeBooking(s, at, 60)];
    const later = await placeBooking(s, new Date('2026-11-02T11:00:00Z'), 60);
    const flags = () =>
      asTenantAdmin(w.A, async (tx, access) => {
        const day = await loadDayTimeline(tx, access, {
          tenantId: s.tenantId,
          siteId: s.siteId,
          day: '2026-11-02' as LocalDate,
        });
        const timeline = day.resources[0]?.timeline;
        if (!timeline) throw new Error('no timeline');
        const rows = await tx
          .select()
          .from(booking)
          .where(inArray(booking.id, [...ids, later]));
        return Object.fromEntries(rows.map((b) => [b.id, isOverCapacity(timeline, b)]));
      });
    expect(Object.values(await flags())).toEqual([false, false, false]);

    const res = await admin(w.A).patch(`${capacity(w.A)}/resources/${s.resourceId}`, {
      body: { capacityCap: 1 },
    });
    expect(res.status).toBe(200);
    const statuses = await ownerDb()
      .select({ status: booking.status })
      .from(booking)
      .where(eq(booking.resourceId, s.resourceId));
    expect(statuses.map((b) => b.status)).toEqual(['confirmed', 'confirmed', 'confirmed']);
    expect(await flags()).toEqual({
      [ids[0] as string]: true,
      [ids[1] as string]: true,
      [later]: false,
    });

    const closure = await admin(w.A).post(`${capacity(w.A)}/closures`, {
      body: {
        siteId: s.siteId,
        kind: 'blocked',
        startsLocal: '2026-11-02T12:00',
        endsLocal: '2026-11-02T13:00',
      },
    });
    expect(closure.status).toBe(201);
    expect((await flags())[later]).toBe(true);
  });
});

describe('MD-03 booking a dock as a single resource or a pool member', () => {
  const book = (dockId: string, body: unknown) =>
    admin(w.A).put(`${capacity(w.A)}/docks/${dockId}/booking`, { body });
  const holders = async (siteId: string) => {
    const res = await admin(w.A).get(`${capacity(w.A)}/resources?siteId=${siteId}`);
    const { items } = (await res.json()) as {
      items: { id: string; active: boolean; dockIds: string[] }[];
    };
    return Object.fromEntries(items.map((r) => [r.id, { active: r.active, dockIds: r.dockIds }]));
  };
  const resourceOf = async (res: Response) =>
    ((await res.json()) as { resource: { id: string } | null }).resource;

  it('keeps each dock in exactly one pool or one single resource while it moves', async () => {
    const s = await capacitySite(w.A.tenantId, { docks: 2, hours: [[1, '06:00', '08:00']] });
    const [d1, d2] = s.dockIds as [DockId, DockId];

    const toSingle = await book(d1, { as: 'single', directions: ['outbound'] });
    expect(toSingle.status).toBe(200);
    const single = (await resourceOf(toSingle))?.id as string;
    expect(await holders(s.siteId)).toEqual({
      [s.resourceId]: { active: true, dockIds: [d2] },
      [single]: { active: true, dockIds: [d1] },
    });

    expect((await book(d1, { as: 'pool', resourceId: s.resourceId })).status).toBe(200);
    expect(await holders(s.siteId)).toEqual({
      [s.resourceId]: { active: true, dockIds: [d1, d2].sort() },
      [single]: { active: false, dockIds: [] },
    });

    const again = await resourceOf(await book(d1, { as: 'single', directions: ['inbound'] }));
    expect(again?.id).toBe(single);

    const none = await book(d1, { as: 'none' });
    expect(await resourceOf(none)).toBeNull();
    expect(await holders(s.siteId)).toEqual({
      [s.resourceId]: { active: true, dockIds: [d2] },
      [single]: { active: false, dockIds: [] },
    });
  });

  it('answers 422 for a pool of another site or a single resource named as the pool', async () => {
    const s = await capacitySite(w.A.tenantId, { docks: 2, hours: [] });
    const other = await capacitySite(w.A.tenantId, { docks: 2, hours: [] });
    const [d1, d2] = s.dockIds as [DockId, DockId];
    const single = await resourceOf(await book(d2, { as: 'single', directions: ['inbound'] }));
    for (const resourceId of [other.resourceId, single?.id]) {
      const res = await book(d1, { as: 'pool', resourceId });
      expect(res.status).toBe(422);
      expect((await error(res)).details?.issues).toEqual([
        expect.objectContaining({ path: ['resourceId'] }),
      ]);
    }
  });
});

describe('MD-04 hours and closures', () => {
  it('replaces site and resource hours separately, with 24:00 as a closing time', async () => {
    const s = w.B.sites[1];
    const put = (resourceId: string | null, rows: unknown[]) =>
      admin(w.B).put(`${capacity(w.B)}/hours`, { body: { siteId: s.id, resourceId, rows } });
    expect(
      (
        await put(null, [
          { weekday: 1, opens: '22:00', closes: '24:00' },
          { weekday: 2, opens: '00:00', closes: '06:00' },
        ])
      ).status,
    ).toBe(200);
    expect(
      (await put(s.resourceId, [{ weekday: 1, opens: '22:30', closes: '23:30' }])).status,
    ).toBe(200);
    expect(
      (
        await put(null, [
          { weekday: 1, opens: '08:00', closes: '12:00' },
          { weekday: 1, opens: '11:00', closes: '14:00' },
        ])
      ).status,
    ).toBe(422);
    expect((await put(null, [{ weekday: 1, opens: '12:00', closes: '08:00' }])).status).toBe(422);
    const list = await admin(w.B).get(`${capacity(w.B)}/hours?siteId=${s.id}`);
    const { items } = (await list.json()) as { items: unknown[] };
    expect(items).toEqual(
      expect.arrayContaining([
        { resourceId: null, weekday: 1, opens: '22:00', closes: '24:00' },
        { resourceId: null, weekday: 2, opens: '00:00', closes: '06:00' },
        { resourceId: s.resourceId, weekday: 1, opens: '22:30', closes: '23:30' },
      ]),
    );
    expect(items).toHaveLength(3);
  });

  it('deletes manual closures, reopens holidays, and refuses the other way round', async () => {
    const s = w.B.sites[0];
    const created = await admin(w.B).post(`${capacity(w.B)}/closures`, {
      body: {
        siteId: s.id,
        kind: 'closed',
        startsLocal: '2026-12-24T00:00',
        endsLocal: '2026-12-25T00:00',
        reason: 'Heiligabend',
      },
    });
    const manual = (await created.json()) as { id: string };
    const holidayRes = await admin(w.B).post(`/api/t/${w.B.tenantId}/sites`, {
      body: {
        name: 'Feiertag',
        addressLine1: 'A 1',
        postalCode: '1',
        city: 'M',
        country: 'DE',
        subdivision: 'DE-BY',
        timeZone: 'Europe/Berlin',
        defaultLocale: 'de',
      },
    });
    const holidaySite = (await holidayRes.json()) as { id: string };
    const list = await admin(w.B).get(
      `${capacity(w.B)}/closures?siteId=${holidaySite.id}&from=2026-12-25&to=2026-12-25`,
    );
    const [christmas] = (
      (await list.json()) as { items: { id: string; holidayName: string; source: string }[] }
    ).items;
    expect(christmas).toMatchObject({ source: 'holiday', holidayName: '1. Weihnachtstag' });

    expect((await admin(w.B).post(`${capacity(w.B)}/closures/${manual.id}/reopen`)).status).toBe(
      409,
    );
    expect((await admin(w.B).delete(`${capacity(w.B)}/closures/${christmas?.id}`)).status).toBe(
      409,
    );
    const reopened = await admin(w.B).post(`${capacity(w.B)}/closures/${christmas?.id}/reopen`);
    expect(reopened.status).toBe(200);
    expect(((await reopened.json()) as { reopenedAt: string }).reopenedAt).toBe(
      '2026-10-19T08:00:00.000Z',
    );
    expect((await admin(w.B).delete(`${capacity(w.B)}/closures/${manual.id}`)).status).toBe(204);
    expect((await admin(w.B).delete(`${capacity(w.B)}/closures/${manual.id}`)).status).toBe(404);
  });
});

describe('MD-05 load types', () => {
  const body = (siteId: string, duration: unknown, resourceIds: string[] = []) => ({
    siteId,
    name: { de: 'Kühlware', en: 'Chilled' },
    direction: 'inbound',
    duration,
    bufferMinutes: 15,
    resourceIds,
  });
  const tiers = {
    kind: 'tiers',
    tiers: [
      { upTo: 10, minutes: 30 },
      { upTo: null, minutes: 45 },
    ],
  };

  it('needs booking.duration_rules for tiers; a tiered type then uses its largest tier', async () => {
    const side = w.A;
    const s = await capacitySite(side.tenantId, { minutes: 30, hours: [[1, '06:00', '08:00']] });
    const created = await admin(side).post(`${capacity(side)}/load-types`, {
      body: body(s.siteId, tiers, [s.resourceId]),
    });
    expect(created.status).toBe(201);
    const lt = (await created.json()) as { id: string; resourceIds: string[] };
    expect(lt.resourceIds).toEqual([s.resourceId]);
    const url = (units: number) =>
      `${capacity(side)}/availability?siteId=${s.siteId}&date=2026-11-02&loadTypeId=${lt.id}&loadUnits=${units}`;
    const minutes = async (units: number) =>
      (
        (await (await as(app, side.users.dispatcher).get(url(units))).json()) as {
          durationMinutes: number;
        }
      ).durationMinutes;
    expect(await minutes(5)).toBe(30);
    expect(await minutes(20)).toBe(45);

    await switchOff(side, 'booking.duration_rules');
    expect(await minutes(5)).toBe(45);
    const denied = await admin(side).post(`${capacity(side)}/load-types`, {
      body: body(s.siteId, tiers),
    });
    expect(denied.status).toBe(403);
    expect(await error(denied)).toMatchObject({
      code: 'entitlement_required',
      details: { key: 'booking.duration_rules' },
    });
    const fixed = await admin(side).post(`${capacity(side)}/load-types`, {
      body: body(s.siteId, { kind: 'fixed', minutes: 20 }),
    });
    expect(fixed.status).toBe(201);
  });

  it('rejects durations over 720 minutes, buffers over 240, and resources of another site', async () => {
    const s = w.B.sites[0];
    const post = (b: unknown) => admin(w.B).post(`${capacity(w.B)}/load-types`, { body: b });
    expect((await post(body(s.id, { kind: 'fixed', minutes: 725 }))).status).toBe(422);
    expect(
      (await post({ ...body(s.id, { kind: 'fixed', minutes: 60 }), bufferMinutes: 245 })).status,
    ).toBe(422);
    const other = await post(body(s.id, { kind: 'fixed', minutes: 60 }, [w.B.sites[1].resourceId]));
    expect(other.status).toBe(422);
    expect((await error(other)).details?.issues).toEqual([
      expect.objectContaining({ path: ['resourceIds', 0] }),
    ]);
  });
});
