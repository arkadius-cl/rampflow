import {
  ClosureKind,
  ClosureSource,
  Direction,
  DurationKind,
  ResourceKind,
} from '@rampflow/shared/modules/booking/values';
import { hoursTemplateRows } from '@rampflow/shared/modules/core/api.sites';
import { TemperatureZone } from '@rampflow/shared/modules/core/values';
import type { LocalDate } from '@rampflow/shared/time';
import { ConflictReason, ErrorCode, Feature } from '@rampflow/shared/values';
import { eq, inArray } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { type DockId, wrapJson } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { testClock } from '../../../kernel/clock.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { entitlementOverride } from '../../core/schema.ts';
import type { TenantRequest } from '../../core/sites/tenant.ts';
import type { LoadTypeId } from '../schema.resources.ts';
import { booking } from '../schema.ts';
import {
  asTenantAdmin,
  asTenantRequest,
  capacitySite,
  placeBooking,
  serviceSite,
} from './fixtures.ts';
import { loadDayTimeline } from './load.ts';
import { putLoadTypeResources, updateLoadType } from './load-types.ts';
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
  it('moves a dock out of its single into a new pool instead of answering 409', async () => {
    const s = w.A.sites[0];
    const first = await admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: {
        siteId: s.id,
        kind: ResourceKind.single,
        name: 'Tor 1',
        directions: ['inbound'],
        dockIds: [s.dockIds[0]],
      },
    });
    expect(first.status).toBe(201);
    const tor = (await first.json()) as { id: string; loadTypeIds: string[] };
    // A dock in no resource brings the site's load types (ADR-0017).
    expect(tor.loadTypeIds).toEqual([s.loadTypeId]);
    const second = await admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: {
        siteId: s.id,
        kind: ResourceKind.pool,
        name: 'Pool',
        directions: ['outbound'],
        dockIds: [...s.dockIds],
      },
    });
    expect(second.status).toBe(201);
    expect(await second.json()).toMatchObject({
      dockIds: [...s.dockIds].sort(),
      loadTypeIds: [s.loadTypeId],
      hallId: null,
    });
    const list = await admin(w.A).get(`${capacity(w.A)}/resources?siteId=${s.id}`);
    const { items } = (await list.json()) as {
      items: { id: string; active: boolean; dockIds: string[] }[];
    };
    expect(items.find((r) => r.id === tor.id)).toMatchObject({ active: false, dockIds: [] });
  });

  it('holds exactly one dock in a single resource and only docks of its own site', async () => {
    const s = w.A.sites[1];
    const two = await admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: {
        siteId: s.id,
        kind: ResourceKind.single,
        name: 'Tor',
        directions: ['inbound'],
        dockIds: [...s.dockIds],
      },
    });
    expect(two.status).toBe(422);
    const foreignDock = await admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: {
        siteId: s.id,
        kind: ResourceKind.single,
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
        kind: ResourceKind.pool,
        name: 'Neu',
        directions: ['inbound'],
        dockIds: [side.sites[0].dockIds[0]],
      },
    });
    expect(res.status).toBe(403);
    expect(await error(res)).toMatchObject({
      code: ErrorCode.entitlement_required,
      details: { key: 'booking.pools' },
    });
    const patch = await admin(side).patch(`${capacity(side)}/resources/${s.resourceId}`, {
      body: { capacityCap: 1 },
    });
    expect(patch.status).toBe(403);
    const single = await admin(side).post(`${capacity(side)}/resources`, {
      body: {
        siteId: side.sites[0].id,
        kind: ResourceKind.single,
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
        kind: ClosureKind.blocked,
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

    const toSingle = await book(d1, { as: ResourceKind.single, directions: ['outbound'] });
    expect(toSingle.status).toBe(200);
    const single = (await resourceOf(toSingle))?.id as string;
    expect(await holders(s.siteId)).toEqual({
      [s.resourceId]: { active: true, dockIds: [d2] },
      [single]: { active: true, dockIds: [d1] },
    });

    expect((await book(d1, { as: ResourceKind.pool, resourceId: s.resourceId })).status).toBe(200);
    expect(await holders(s.siteId)).toEqual({
      [s.resourceId]: { active: true, dockIds: [d1, d2].sort() },
      [single]: { active: false, dockIds: [] },
    });

    const again = (await (await book(d1, { as: ResourceKind.single })).json()) as {
      resource: { id: string; directions: string[] };
    };
    expect(again.resource).toMatchObject({ id: single, directions: ['outbound'] });

    expect(await holders(s.siteId)).toEqual({
      [s.resourceId]: { active: true, dockIds: [d2] },
      [single]: { active: true, dockIds: [d1] },
    });
  });

  it('keeps both docks when two admins move docks into the same pool at once', async () => {
    const s = await capacitySite(w.A.tenantId, { docks: 3, hours: [] });
    const [d1, d2, d3] = s.dockIds as [DockId, DockId, DockId];
    await book(d2, { as: ResourceKind.single });
    await book(d3, { as: ResourceKind.single });
    const both = await Promise.all([
      book(d2, { as: ResourceKind.pool, resourceId: s.resourceId }),
      book(d3, { as: ResourceKind.pool, resourceId: s.resourceId }),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect((await holders(s.siteId))[s.resourceId]?.dockIds).toEqual([d1, d2, d3].sort());
  });

  it('answers 422 for a pool of another site or a single resource named as the pool', async () => {
    const s = await capacitySite(w.A.tenantId, { docks: 2, hours: [] });
    const other = await capacitySite(w.A.tenantId, { docks: 2, hours: [] });
    const [d1, d2] = s.dockIds as [DockId, DockId];
    const single = await resourceOf(
      await book(d2, { as: ResourceKind.single, directions: ['inbound'] }),
    );
    for (const resourceId of [other.resourceId, single?.id]) {
      const res = await book(d1, { as: ResourceKind.pool, resourceId });
      expect(res.status).toBe(422);
      expect((await error(res)).details?.issues).toEqual([
        expect.objectContaining({ path: ['resourceId'] }),
      ]);
    }
  });
});

describe('MD-03 without booking.pools no dock leaves a pool (ADR-0017)', () => {
  // Its own world: switching pools off would change world A for the other tests.
  let own: World;
  beforeAll(async () => {
    own = await world();
  });
  const api = (path: string) => `/api/t/${own.A.tenantId}/capacity${path}`;
  const memberships = async (siteId: string) =>
    Object.fromEntries(
      (
        (await (await admin(own.A).get(api(`/resources?siteId=${siteId}`))).json()) as {
          items: { id: string; dockIds: string[] }[];
        }
      ).items.map((r) => [r.id, r.dockIds]),
    );

  it("answers 403 for a single or a single's docks taken out of a pool", async () => {
    const s = await serviceSite(own.A, [
      { code: 'T01', hall: 'Halle 1' },
      { code: 'T02', hall: 'Halle 1' },
      { code: 'T03', hall: 'Halle 2' },
    ]);
    const booked = await admin(own.A).put(api(`/docks/${s.docks.T03}/booking`), {
      body: { as: ResourceKind.single },
    });
    const single = ((await booked.json()) as { resource: { id: string } }).resource.id;
    await switchOff(own.A, Feature.booking.pools);
    const before = await memberships(s.siteId);

    const created = await admin(own.A).post(api('/resources'), {
      body: {
        siteId: s.siteId,
        kind: ResourceKind.single,
        name: 'T01',
        directions: [Direction.inbound],
        dockIds: [s.docks.T01],
      },
    });
    expect(created.status).toBe(403);
    expect(await error(created)).toMatchObject({ code: ErrorCode.entitlement_required });
    const replaced = await admin(own.A).put(api(`/resources/${single}/docks`), {
      body: { dockIds: [s.docks.T01] },
    });
    expect(replaced.status).toBe(403);
    expect(await memberships(s.siteId)).toEqual(before);
  });

  it("replaces a single's dock, giving the removed dock a single of its own", async () => {
    const s = await serviceSite(
      own.A,
      [
        { code: 'S01', hall: 'Halle 1' },
        { code: 'S02', hall: 'Halle 1' },
      ],
      { pools: false },
    );
    const byDock = async () =>
      Object.entries(await memberships(s.siteId)).flatMap(([id, docks]) =>
        docks.map((d) => [d, id] as const),
      );
    const s01 = (await byDock()).find(([d]) => d === s.docks.S01)?.[1] as string;
    const res = await admin(own.A).put(api(`/resources/${s01}/docks`), {
      body: { dockIds: [s.docks.S02] },
    });
    expect(res.status).toBe(200);
    const after = await byDock();
    expect(after.map(([d]) => d).sort()).toEqual([s.docks.S01, s.docks.S02].sort());
    expect(Object.fromEntries(after)[s.docks.S02 as string]).toBe(s01);
    expect(Object.fromEntries(after)[s.docks.S01 as string]).not.toBe(s01);
  });
});

describe('MD-03 pools hold docks of one profile and every dock has a resource (ADR-0017)', () => {
  const hamburg = () =>
    serviceSite(w.A, [
      ...['T01', 'T02', 'T03', 'T04', 'T05'].map((code) => ({ code, hall: 'Halle 1' })),
      ...['T06', 'T07', 'T08'].map((code) => ({ code, hall: 'Halle 2' })),
      { code: 'T09', hall: 'Halle 2', temperatureZone: TemperatureZone.frozen },
    ]);
  type View = {
    id: string;
    name: string;
    hallId: string | null;
    temperatureZone: string;
    dockIds: string[];
    loadTypeIds: string[];
  };
  const list = async (siteId: string) =>
    (
      (await (await admin(w.A).get(`${capacity(w.A)}/resources?siteId=${siteId}`)).json()) as {
        items: View[];
      }
    ).items;
  const holderOf = async (siteId: string, dockId: string | undefined) =>
    (await list(siteId)).find((r) => r.dockIds.includes(dockId as string));
  const named = async (siteId: string, name: string) =>
    (await list(siteId)).find((r) => r.name === name) as View;
  const book = (dockId: string | undefined, body: unknown) =>
    admin(w.A).put(`${capacity(w.A)}/docks/${dockId}/booking`, { body });
  const newPool = (siteId: string, name: string, dockIds: (string | undefined)[]) =>
    admin(w.A).post(`${capacity(w.A)}/resources`, {
      body: { siteId, kind: ResourceKind.pool, name, directions: ['inbound'], dockIds },
    });
  const setDocks = (resourceId: string, dockIds: (string | undefined)[]) =>
    admin(w.A).put(`${capacity(w.A)}/resources/${resourceId}/docks`, { body: { dockIds } });

  it('lists the profile and hall of the pool holding the frozen dock', async () => {
    const s = await hamburg();
    expect(await holderOf(s.siteId, s.docks.T09)).toMatchObject({
      temperatureZone: TemperatureZone.frozen,
      hallId: s.halls['Halle 2'],
    });
  });

  it('answers 409 profile_mismatch for a frozen dock booked into an ambient pool', async () => {
    const s = await hamburg();
    const before = await holderOf(s.siteId, s.docks.T09);
    const res = await book(s.docks.T09, {
      as: ResourceKind.pool,
      resourceId: (await named(s.siteId, 'Halle 2')).id,
    });
    expect(res.status).toBe(409);
    expect(await error(res)).toMatchObject({
      code: ErrorCode.conflict,
      details: { reason: ConflictReason.profile_mismatch, dockIds: [s.docks.T09] },
    });
    expect((await holderOf(s.siteId, s.docks.T09))?.id).toBe(before?.id);
  });

  it('answers 422 at ["as"] for "none" and keeps the dock in its resource', async () => {
    const s = await hamburg();
    // `none` is no longer a member of ResourceKind.
    const res = await book(s.docks.T01, { as: 'none' satisfies string });
    expect(res.status).toBe(422);
    expect((await error(res)).details?.issues).toEqual([expect.objectContaining({ path: ['as'] })]);
    expect((await holderOf(s.siteId, s.docks.T01))?.name).toBe('Halle 1');
  });

  it('splits inbound docks off a hall pool, sends a removed dock home, and keeps the last', async () => {
    const s = await hamburg();
    const halle1 = await named(s.siteId, 'Halle 1');
    const split = await newPool(s.siteId, 'Wareneingang', [
      s.docks.T01,
      s.docks.T02,
      s.docks.T03,
      s.docks.T04,
    ]);
    expect(split.status).toBe(201);
    const wareneingang = (await split.json()) as View;
    expect(wareneingang).toMatchObject({ hallId: null, loadTypeIds: halle1.loadTypeIds });
    expect((await named(s.siteId, 'Halle 1')).dockIds).toEqual([s.docks.T05]);

    const shrink = await setDocks(wareneingang.id, [s.docks.T01, s.docks.T02, s.docks.T03]);
    expect(shrink.status).toBe(200);
    expect((await named(s.siteId, 'Halle 1')).dockIds).toEqual([s.docks.T04, s.docks.T05].sort());

    const own = await setDocks(halle1.id, [s.docks.T04]);
    expect(own.status).toBe(409);
    expect(await error(own)).toMatchObject({
      details: { reason: ConflictReason.dock_needs_resource, dockIds: [s.docks.T05] },
    });
    expect((await named(s.siteId, 'Halle 1')).dockIds).toEqual([s.docks.T04, s.docks.T05].sort());
  });

  it('answers 409 profile_mismatch for a new pool of mixed profiles', async () => {
    const s = await hamburg();
    const res = await newPool(s.siteId, 'Gemischt', [s.docks.T07, s.docks.T09]);
    expect(res.status).toBe(409);
    expect(await error(res)).toMatchObject({
      details: { reason: ConflictReason.profile_mismatch, dockIds: [s.docks.T09] },
    });
    expect((await named(s.siteId, 'Halle 2')).dockIds).toContain(s.docks.T07);
  });

  it('keeps a default pool to its hall, while a manual pool spans halls', async () => {
    const s = await hamburg();
    const res = await book(s.docks.T06, {
      as: ResourceKind.pool,
      resourceId: (await named(s.siteId, 'Halle 1')).id,
    });
    expect(res.status).toBe(422);
    expect((await error(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['resourceId'] }),
    ]);
    expect((await holderOf(s.siteId, s.docks.T06))?.name).toBe('Halle 2');
    const halle1 = await named(s.siteId, 'Halle 1');
    const into = await setDocks(halle1.id, [...halle1.dockIds, s.docks.T06]);
    expect(into.status).toBe(422);
    expect((await error(into)).details?.issues).toEqual([
      expect.objectContaining({ path: ['dockIds', 5] }),
    ]);

    const express = await newPool(s.siteId, 'Express', [s.docks.T05, s.docks.T08]);
    expect(express.status).toBe(201);
    expect(((await express.json()) as View).dockIds).toEqual([s.docks.T05, s.docks.T08].sort());
  });
});

describe('MD-05 every dock stays bookable for an active load type (ADR-0017)', () => {
  const loadTypes = () => `${capacity(w.A)}/load-types`;
  type LoadType = { id: string; active: boolean; resourceIds: string[] };
  const typesOf = async (siteId: string) =>
    (
      (await (await admin(w.A).get(`${loadTypes()}?siteId=${siteId}`)).json()) as {
        items: LoadType[];
      }
    ).items;
  const unlink = (id: string) =>
    admin(w.A).put(`${loadTypes()}/${id}/resources`, { body: { resourceIds: [] } });
  const deactivate = (id: string) =>
    admin(w.A).patch(`${loadTypes()}/${id}`, { body: { active: false } });
  /** A hall pool with two docks, linked to the first `keep` of the site's three load types. */
  async function poolWith(keep: number) {
    const s = await serviceSite(w.A, [
      { code: 'T01', hall: 'Halle 1' },
      { code: 'T02', hall: 'Halle 1' },
    ]);
    const types = await typesOf(s.siteId);
    for (const lt of types.slice(keep)) expect((await unlink(lt.id)).status).toBe(200);
    const pool = types[0]?.resourceIds[0] as string;
    return { ...s, pool, kept: types.slice(0, keep).map((lt) => lt.id) };
  }
  const stranded = (s: { docks: Record<string, string> }) => ({
    code: ErrorCode.conflict,
    details: {
      reason: ConflictReason.dock_without_load_type,
      dockIds: [s.docks.T01, s.docks.T02].sort(),
    },
  });

  it('answers 409 for unlinking the last load type and keeps the link', async () => {
    const s = await poolWith(1);
    const res = await unlink(s.kept[0] as string);
    expect(res.status).toBe(409);
    expect(await error(res)).toMatchObject(stranded(s));
    expect((await typesOf(s.siteId)).find((lt) => lt.id === s.kept[0])?.resourceIds).toEqual([
      s.pool,
    ]);
  });

  it('answers 409 for deactivating the last load type and keeps it active', async () => {
    const s = await poolWith(1);
    const res = await deactivate(s.kept[0] as string);
    expect(res.status).toBe(409);
    expect(await error(res)).toMatchObject(stranded(s));
    expect((await typesOf(s.siteId)).find((lt) => lt.id === s.kept[0])?.active).toBe(true);
  });

  /**
   * Two transactions on two connections: the second starts once the first has written and
   * commits 300 ms later, so without the site lock both would pass their checks.
   */
  async function race(write: (tx: Tx, req: TenantRequest, id: LoadTypeId) => Promise<unknown>) {
    const s = await poolWith(2);
    const [first, second] = s.kept as [LoadTypeId, LoadTypeId];
    let wrote = () => {};
    const written = new Promise<void>((resolve) => {
      wrote = resolve;
    });
    const outcome = (p: Promise<unknown>) =>
      p.then(
        () => 200,
        (e: unknown) => (e instanceof ApiError ? e.details?.reason : e),
      );
    const a = outcome(
      asTenantRequest(w.A, async (tx, req) => {
        try {
          await write(tx, req, first);
        } finally {
          wrote();
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }),
    );
    await written;
    const b = outcome(asTenantRequest(w.A, (tx, req) => write(tx, req, second)));
    expect([await a, await b]).toEqual([200, ConflictReason.dock_without_load_type]);
    const serving = (await typesOf(s.siteId)).filter(
      (lt) => lt.active && lt.resourceIds.includes(s.pool),
    );
    expect(serving.map((lt) => lt.id)).toEqual([second]);
  }

  it('lets only one of two concurrent deactivations of the last two load types pass', () =>
    race((tx, req, id) => updateLoadType(tx, req, id, { active: false })));

  it('lets only one of two concurrent unlinks of the last two load types pass', () =>
    race((tx, req, id) => putLoadTypeResources(tx, req.tenantId, id, [])));
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

    const cleared = await put(s.resourceId, []);
    expect(cleared.status).toBe(200);
    const after = await admin(w.B).get(`${capacity(w.B)}/hours?siteId=${s.id}`);
    expect(((await after.json()) as { items: { resourceId: string | null }[] }).items).toEqual([
      expect.objectContaining({ resourceId: null }),
      expect.objectContaining({ resourceId: null }),
    ]);
  });

  it('deletes manual closures, reopens holidays, and refuses the other way round', async () => {
    const s = w.B.sites[0];
    const created = await admin(w.B).post(`${capacity(w.B)}/closures`, {
      body: {
        siteId: s.id,
        kind: ClosureKind.closed,
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
        hours: hoursTemplateRows.one_shift,
      },
    });
    const holidaySite = (await holidayRes.json()) as { id: string };
    const list = await admin(w.B).get(
      `${capacity(w.B)}/closures?siteId=${holidaySite.id}&from=2026-12-25&to=2026-12-25`,
    );
    const [christmas] = (
      (await list.json()) as { items: { id: string; holidayName: string; source: string }[] }
    ).items;
    expect(christmas).toMatchObject({
      source: ClosureSource.holiday,
      holidayName: '1. Weihnachtstag',
    });

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
    direction: Direction.inbound,
    duration,
    bufferMinutes: 15,
    resourceIds,
  });
  const tiers = {
    kind: DurationKind.tiers,
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
      code: ErrorCode.entitlement_required,
      details: { key: 'booking.duration_rules' },
    });
    const fixed = await admin(side).post(`${capacity(side)}/load-types`, {
      body: body(s.siteId, { kind: DurationKind.fixed, minutes: 20 }),
    });
    expect(fixed.status).toBe(201);
  });

  it('rejects durations over 720 minutes, buffers over 240, and resources of another site', async () => {
    const s = w.B.sites[0];
    const post = (b: unknown) => admin(w.B).post(`${capacity(w.B)}/load-types`, { body: b });
    expect((await post(body(s.id, { kind: DurationKind.fixed, minutes: 725 }))).status).toBe(422);
    expect(
      (await post({ ...body(s.id, { kind: DurationKind.fixed, minutes: 60 }), bufferMinutes: 245 }))
        .status,
    ).toBe(422);
    const other = await post(
      body(s.id, { kind: DurationKind.fixed, minutes: 60 }, [w.B.sites[1].resourceId]),
    );
    expect(other.status).toBe(422);
    expect((await error(other)).details?.issues).toEqual([
      expect.objectContaining({ path: ['resourceIds', 0] }),
    ]);
  });
});
