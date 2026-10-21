import { durationFor } from '@rampflow/shared/modules/booking/duration';
import { ResourceKind } from '@rampflow/shared/modules/booking/values';
import {
  type HolidayRegions,
  hoursTemplateRows,
  type SiteCountries,
} from '@rampflow/shared/modules/core/api.sites';
import { DockStatus, DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { ConflictReason, ErrorCode, PackageId } from '@rampflow/shared/values';
import { and, count, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { serviceSite } from '../../booking/capacity/fixtures.ts';
import { closure, loadType } from '../../booking/schema.resources.ts';
import { site } from '../schema.ts';

const app = createApp({ clock: testClock(new Date('2026-10-19T08:00:00Z')) });

let w: World;
beforeAll(async () => {
  w = await world({ packages: { A: PackageId.start, B: PackageId.pro } });
});

const garching = {
  name: 'Lager Garching',
  addressLine1: 'Industriestr. 5',
  postalCode: '85748',
  city: 'Garching',
  country: 'DE',
  subdivision: 'DE-BY',
  timeZone: 'Europe/Berlin',
  defaultLocale: 'de',
  hours: hoursTemplateRows.one_shift,
};

const admin = (side: World['A']) => as(app, side.users.tenant_admin);
const sitesOf = (side: World['A']) => `/api/t/${side.tenantId}/sites`;

async function error(res: Response) {
  return ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } })
    .error;
}

describe('MD-01 sites', () => {
  it('rejects an unknown time zone with 422 on the zone path', async () => {
    const res = await admin(w.B).post(sitesOf(w.B), {
      body: { ...garching, timeZone: 'Europe/Atlantis' },
    });
    expect(res.status).toBe(422);
    const e = await error(res);
    expect(e.code).toBe('validation_failed');
    expect(e.details?.issues).toEqual([expect.objectContaining({ path: ['timeZone'] })]);
    const patch = await admin(w.A).patch(`${sitesOf(w.A)}/${w.A.sites[0].id}`, {
      body: { timeZone: 'Mars/Base' },
    });
    expect(patch.status).toBe(422);
  });

  it('answers 409 limit_reached for the site beyond core.max_sites, and when reactivating one', async () => {
    // Package start allows one site; world A already has two.
    const res = await admin(w.A).post(sitesOf(w.A), { body: garching });
    expect(res.status).toBe(409);
    expect(await error(res)).toMatchObject({
      code: ErrorCode.limit_reached,
      details: { key: 'core.max_sites', limit: 1 },
    });
    const off = await admin(w.A).patch(`${sitesOf(w.A)}/${w.A.sites[1].id}`, {
      body: { active: false },
    });
    expect(off.status).toBe(200);
    const on = await admin(w.A).patch(`${sitesOf(w.A)}/${w.A.sites[1].id}`, {
      body: { active: true },
    });
    expect(on.status).toBe(409);
  });

  it('creates a site with the three seeded load types and its public holidays', async () => {
    const res = await admin(w.B).post(sitesOf(w.B), { body: garching });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; timeZone: string };
    expect(created.timeZone).toBe('Europe/Berlin');

    const types = await ownerDb()
      .select()
      .from(loadType)
      .where(eq(loadType.siteId, created.id as never));
    expect(types.map((t) => t.name.en).sort()).toEqual([
      'Floor-loaded / loose',
      'Palletised',
      'Parcel / van',
    ]);
    const palletised = types.find((t) => t.name.en === 'Palletised');
    if (!palletised) throw new Error('no Palletised');
    const withRules = { features: { 'booking.duration_rules': true } } as never;
    const withoutRules = { features: { 'booking.duration_rules': false } } as never;
    expect(durationFor(palletised, 20, withRules)).toBe(60);
    expect(durationFor(palletised, 40, withRules)).toBe(90);
    expect(durationFor(palletised, 10, withRules)).toBe(30);
    expect(durationFor(palletised, 10, withoutRules)).toBe(90);

    const [holidays] = await ownerDb()
      .select({ n: count() })
      .from(closure)
      .where(and(eq(closure.siteId, created.id as never), eq(closure.source, 'holiday')));
    expect(holidays?.n).toBeGreaterThan(10);
  });

  it('lists only the sites a gate operator may see', async () => {
    const res = await as(app, w.A.users.gate_operator).get(sitesOf(w.A));
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((s) => s.id)).toEqual([w.A.sites[0].id]);
    const all = (await (await admin(w.A).get(sitesOf(w.A))).json()) as { items: unknown[] };
    expect(all.items).toHaveLength(2);
  });
});

describe('MD-02 halls and docks', () => {
  const dockBody = (hallId: string, code: string, status = 'active') => ({
    hallId,
    code,
    doorType: DoorType.ground_level,
    temperatureZone: TemperatureZone.frozen,
    adrAllowed: true,
    status,
  });

  it('keeps dock codes unique per site, not per tenant', async () => {
    const [s0, s1] = w.B.sites;
    const docks = (s: typeof s0) => `${sitesOf(w.B)}/${s.id}/docks`;
    const dup = await admin(w.B).post(docks(s0), { body: dockBody(s0.hallId, 'D-01') });
    expect(dup.status).toBe(409);
    expect(await error(dup)).toMatchObject({
      code: ErrorCode.conflict,
      details: { reason: ConflictReason.duplicate_code },
    });
    const other = await admin(w.B).post(docks(s1), { body: dockBody(s1.hallId, 'D-77') });
    expect(other.status).toBe(201);
    const same = await admin(w.B).post(docks(s0), { body: dockBody(s0.hallId, 'D-77') });
    expect(same.status).toBe(201);
    const rename = await admin(w.B).patch(`${docks(s0)}/${s0.dockIds[0]}`, {
      body: { code: 'D-02' },
    });
    expect(rename.status).toBe(409);
  });

  it('rejects a hall of another site with 422', async () => {
    const [s0, s1] = w.B.sites;
    const res = await admin(w.B).post(`${sitesOf(w.B)}/${s0.id}/docks`, {
      body: dockBody(s1.hallId, 'D-50'),
    });
    expect(res.status).toBe(422);
    expect((await error(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['hallId'] }),
    ]);
  });

  it('counts active and maintenance docks toward core.max_docks, not inactive ones', async () => {
    // Package start allows 10 docks; world A has 4 active ones.
    const s0 = w.A.sites[0];
    const url = `${sitesOf(w.A)}/${s0.id}/docks`;
    for (let i = 0; i < 5; i++) {
      expect((await admin(w.A).post(url, { body: dockBody(s0.hallId, `A-${i}`) })).status).toBe(
        201,
      );
    }
    expect(
      (await admin(w.A).post(url, { body: dockBody(s0.hallId, 'M-1', 'maintenance') })).status,
    ).toBe(201);
    const over = await admin(w.A).post(url, { body: dockBody(s0.hallId, 'A-9') });
    expect(over.status).toBe(409);
    expect(await error(over)).toMatchObject({
      code: ErrorCode.limit_reached,
      details: { key: 'core.max_docks' },
    });
    expect(
      (await admin(w.A).post(url, { body: dockBody(s0.hallId, 'X-1', 'inactive') })).status,
    ).toBe(201);

    const docks = (await (await admin(w.A).get(url)).json()) as {
      items: { id: string; code: string }[];
    };
    const inactive = docks.items.find((d) => d.code === 'X-1');
    const reactivate = await admin(w.A).patch(`${url}/${inactive?.id}`, {
      body: { status: DockStatus.active },
    });
    expect(reactivate.status).toBe(409);
    expect(
      (await admin(w.A).patch(`${url}/${s0.dockIds[0]}`, { body: { status: DockStatus.inactive } }))
        .status,
    ).toBe(200);
    expect(
      (
        await admin(w.A).patch(`${url}/${inactive?.id}`, {
          body: { status: DockStatus.maintenance },
        })
      ).status,
    ).toBe(200);
    const list = (await (await admin(w.A).get(sitesOf(w.A))).json()) as {
      items: { active: boolean }[];
      usage: unknown;
    };
    const activeSites = list.items.filter((s) => s.active).length;
    expect(list.usage).toEqual({ sites: activeSites, docks: 10 });
  });

  it('creates and renames halls', async () => {
    const url = `${sitesOf(w.B)}/${w.B.sites[1].id}/halls`;
    const created = await admin(w.B).post(url, { body: { name: 'Halle 2', sort: 2 } });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await admin(w.B).patch(`${url}/${id}`, { body: { name: 'Kühlhalle' } })).status).toBe(
      200,
    );
    const list = (await (await admin(w.B).get(url)).json()) as { items: { name: string }[] };
    expect(list.items.map((h) => h.name)).toEqual(['Hall 1', 'Kühlhalle']);
  });
});

describe('MD-02 docks join the resource of their hall and profile (ADR-0017)', () => {
  // Its own world: the sites built here would use up world B's core.max_sites.
  let p: World;
  beforeAll(async () => {
    p = await world();
  });
  const docksOf = (siteId: string) => `${sitesOf(p.A)}/${siteId}/docks`;
  type Resource = {
    id: string;
    name: string;
    kind: string;
    hallId: string | null;
    adrAllowed: boolean;
    dockIds: string[];
  };
  const holderOf = async (siteId: string, dockId: string | undefined) => {
    const res = await admin(p.A).get(`/api/t/${p.A.tenantId}/capacity/resources?siteId=${siteId}`);
    const { items } = (await res.json()) as { items: Resource[] };
    return items.find((r) => r.dockIds.includes(dockId as string));
  };
  const hamburg = () =>
    serviceSite(p.A, [
      ...['T01', 'T04', 'T05'].map((code) => ({ code, hall: 'Halle 1' })),
      ...['T06', 'T08'].map((code) => ({ code, hall: 'Halle 2' })),
    ]);

  it('answers 201 with the resource of a new dock, the default pool of its hall', async () => {
    const s = await hamburg();
    const res = await admin(p.A).post(docksOf(s.siteId), {
      body: {
        hallId: s.halls['Halle 1'],
        code: 'T02',
        doorType: DoorType.dock_leveler,
        temperatureZone: TemperatureZone.ambient,
      },
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; resourceId: string | null };
    expect(created.resourceId).not.toBeNull();
    expect(await holderOf(s.siteId, created.id)).toMatchObject({
      id: created.resourceId,
      name: 'Halle 1',
      hallId: s.halls['Halle 1'],
    });
  });

  it('moves a pooled dock that becomes chilled to "Halle 1 · Kühl"', async () => {
    const s = await hamburg();
    const res = await admin(p.A).patch(`${docksOf(s.siteId)}/${s.docks.T05}`, {
      body: { temperatureZone: TemperatureZone.chilled },
    });
    expect(res.status).toBe(200);
    const moved = (await res.json()) as { temperatureZone: string; resourceId: string };
    expect(moved.temperatureZone).toBe(TemperatureZone.chilled);
    expect(await holderOf(s.siteId, s.docks.T05)).toMatchObject({
      id: moved.resourceId,
      name: 'Halle 1 · Kühl',
      hallId: s.halls['Halle 1'],
      dockIds: [s.docks.T05],
    });
  });

  it('keeps a single dock in its single when its profile changes', async () => {
    const s = await hamburg();
    const booked = await admin(p.A).put(
      `/api/t/${p.A.tenantId}/capacity/docks/${s.docks.T08}/booking`,
      { body: { as: ResourceKind.single } },
    );
    const single = ((await booked.json()) as { resource: { id: string } }).resource;
    const res = await admin(p.A).patch(`${docksOf(s.siteId)}/${s.docks.T08}`, {
      body: { adrAllowed: true },
    });
    expect(res.status).toBe(200);
    expect(await holderOf(s.siteId, s.docks.T08)).toMatchObject({
      id: single.id,
      adrAllowed: true,
    });
  });

  it('moves a dock to the default pool of its new hall, but keeps it in a manual pool', async () => {
    const s = await hamburg();
    const hallTwo = await admin(p.A).patch(`${docksOf(s.siteId)}/${s.docks.T04}`, {
      body: { hallId: s.halls['Halle 2'] },
    });
    expect(hallTwo.status).toBe(200);
    expect(await holderOf(s.siteId, s.docks.T04)).toMatchObject({
      name: 'Halle 2',
      hallId: s.halls['Halle 2'],
    });

    const express = await admin(p.A).post(`/api/t/${p.A.tenantId}/capacity/resources`, {
      body: {
        siteId: s.siteId,
        kind: ResourceKind.pool,
        name: 'Express',
        directions: ['inbound'],
        dockIds: [s.docks.T05, s.docks.T08],
      },
    });
    const { id } = (await express.json()) as { id: string };
    const res = await admin(p.A).patch(`${docksOf(s.siteId)}/${s.docks.T05}`, {
      body: { hallId: s.halls['Halle 2'] },
    });
    expect(res.status).toBe(200);
    expect((await holderOf(s.siteId, s.docks.T05))?.id).toBe(id);
  });
});

describe('site region changes', () => {
  it('replaces holidays of the former region and keeps reopened dates', async () => {
    const res = await admin(w.B).post(sitesOf(w.B), { body: { ...garching, name: 'Wechsel' } });
    const { id } = (await res.json()) as { id: string };
    const holidays = async () =>
      (
        await ownerDb()
          .select({ date: closure.holidayDate })
          .from(closure)
          .where(and(eq(closure.siteId, id as never), eq(closure.source, 'holiday')))
      )
        .map((r) => r.date)
        .sort();
    // Heilige Drei Könige is a holiday in Bavaria, not in Hamburg.
    expect(await holidays()).toContain('2027-01-06');
    const patch = await admin(w.B).patch(`${sitesOf(w.B)}/${id}`, {
      body: { subdivision: 'DE-HH' },
    });
    expect(patch.status).toBe(200);
    expect(await holidays()).not.toContain('2027-01-06');
    expect(await holidays()).toContain('2026-12-25');
    const bad = await admin(w.B).patch(`${sitesOf(w.B)}/${id}`, { body: { subdivision: 'AT-9' } });
    expect(bad.status).toBe(422);
    const [row] = await ownerDb()
      .select()
      .from(site)
      .where(eq(site.id, id as never));
    expect(row?.subdivision).toBe('DE-HH');
  });
});

describe('holiday regions', () => {
  const regionsOf = (country: string) =>
    as(app, null).get(`/api/public/countries/${country}/holiday-regions`);

  it('lists the subdivisions of a country with their own holidays, by native name', async () => {
    const res = await regionsOf('DE');
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as HolidayRegions;
    expect(items).toHaveLength(16);
    expect(items).toContainEqual({ code: 'DE-BY', name: 'Bayern' });
  });

  it('answers an empty list for a country without regional holidays', async () => {
    const res = await regionsOf('RO');
    expect(((await res.json()) as HolidayRegions).items).toEqual([]);
  });

  it('answers 404 for a country that is not ISO 3166-1 alpha-2', async () => {
    expect((await regionsOf('de')).status).toBe(404);
  });
});

describe('admitted site countries', () => {
  const countries = () => as(app, null).get('/api/public/countries');
  const admit = (value: string[]) =>
    as(app, w.platformAdmin).put('/api/platform/settings/core.site_countries', { body: { value } });

  it('admits the EU states by default', async () => {
    const { items } = (await (await countries()).json()) as SiteCountries;
    expect(items).toHaveLength(27);
    expect(items).toEqual(expect.arrayContaining(['DE', 'AT', 'PL']));
  });

  it('admits no country outside Europe', async () => {
    expect((await admit(['DE', 'US'])).status).toBe(422);
  });

  it('rejects a site in a country the platform does not admit, and keeps existing ones', async () => {
    expect((await admit(['AT'])).status).toBe(200);
    try {
      expect(((await (await countries()).json()) as SiteCountries).items).toEqual(['AT']);

      const created = await admin(w.B).post(sitesOf(w.B), { body: garching });
      expect(created.status).toBe(422);
      expect((await error(created)).details?.issues).toEqual([
        expect.objectContaining({ path: ['country'] }),
      ]);

      const site = `${sitesOf(w.B)}/${w.B.sites[0].id}`;
      expect((await admin(w.B).patch(site, { body: { name: 'Lager Nord' } })).status).toBe(200);
      const moved = await admin(w.B).patch(site, { body: { country: 'CZ', subdivision: null } });
      expect(moved.status).toBe(422);
    } finally {
      await as(app, w.platformAdmin).delete('/api/platform/settings/core.site_countries');
    }
  });
});
