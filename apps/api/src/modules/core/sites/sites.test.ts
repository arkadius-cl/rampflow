import { durationFor } from '@rampflow/shared/modules/booking/duration';
import { and, count, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { closure, loadType } from '../../booking/schema.resources.ts';
import { site } from '../schema.ts';

const app = createApp({ clock: testClock(new Date('2026-10-19T08:00:00Z')) });

let w: World;
beforeAll(async () => {
  w = await world({ packages: { A: 'start', B: 'pro' } });
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
      code: 'limit_reached',
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
    doorType: 'ground_level',
    temperatureZone: 'frozen',
    adrAllowed: true,
    status,
  });

  it('keeps dock codes unique per site, not per tenant', async () => {
    const [s0, s1] = w.B.sites;
    const docks = (s: typeof s0) => `${sitesOf(w.B)}/${s.id}/docks`;
    const dup = await admin(w.B).post(docks(s0), { body: dockBody(s0.hallId, 'D-01') });
    expect(dup.status).toBe(409);
    expect(await error(dup)).toMatchObject({
      code: 'conflict',
      details: { reason: 'duplicate_code' },
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
      code: 'limit_reached',
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
      body: { status: 'active' },
    });
    expect(reactivate.status).toBe(409);
    expect(
      (await admin(w.A).patch(`${url}/${s0.dockIds[0]}`, { body: { status: 'inactive' } })).status,
    ).toBe(200);
    expect(
      (await admin(w.A).patch(`${url}/${inactive?.id}`, { body: { status: 'maintenance' } }))
        .status,
    ).toBe(200);
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
