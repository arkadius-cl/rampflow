import { Direction, ResourceKind } from '@rampflow/shared/modules/booking/values';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { dock } from '../../core/schema.ts';
import { bookableResource, loadTypeResource, resourceDock } from '../schema.resources.ts';
import { booking } from '../schema.ts';
import { type CapacitySite, capacitySite } from './fixtures.ts';

// Availability performance at design load (mvp-scope, "Performance"): 120,000 bookings a month
// over 1,000 docks, so about 4 bookings per dock and day. Runs with `pnpm bench` only.

const RUNS = 50;
const RESOURCES = 30;
const DAY = '2026-11-04';

const app = createApp({ clock: testClock(new Date('2026-10-19T08:00:00Z')) });
let w: World;
let bench: CapacitySite;
let resourceIds: string[];

let codes = 0;

async function insertBookings(
  s: CapacitySite,
  resources: string[],
  days: number,
  perDockDay: number,
) {
  const rows = [];
  const start = Date.parse(`${DAY}T00:00:00Z`) - Math.floor(days / 2) * 86_400_000;
  for (let d = 0; d < days; d++) {
    for (const resourceId of resources) {
      for (let k = 0; k < perDockDay; k++) {
        const startsAt = new Date(start + d * 86_400_000 + (5 + ((k * 3.5) % 17)) * 3_600_000);
        const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
        rows.push({
          tenantId: s.tenantId,
          siteId: s.siteId,
          resourceId: resourceId as never,
          loadTypeId: s.loadTypeId,
          carrierName: 'Bench',
          // Unique per tenant (booking_tenant_code_key); random codes collide at this volume.
          code: `B${String(codes++).padStart(7, '0')}`,
          status: 'confirmed' as const,
          direction: 'inbound' as const,
          startsAt,
          endsAt,
          blocksUntil: endsAt,
          siteTimeZone: s.zone,
          loadUnits: 20,
          createdParty: 'staff' as const,
        });
      }
    }
  }
  for (let i = 0; i < rows.length; i += 2000) {
    await ownerDb()
      .insert(booking)
      .values(rows.slice(i, i + 2000));
  }
}

async function addResources(s: CapacitySite, n: number): Promise<string[]> {
  const o = ownerDb();
  const [first] = await o
    .select({ hallId: dock.hallId })
    .from(dock)
    .where(eq(dock.siteId, s.siteId));
  if (!first) throw new Error('fixture site has no dock');
  const created = [s.resourceId as string];
  for (let i = 1; i < n; i++) {
    const [r] = await o
      .insert(bookableResource)
      .values({
        tenantId: s.tenantId,
        siteId: s.siteId,
        kind: 'single',
        name: `Tor ${i}`,
        directions: [Direction.inbound],
        sort: i,
      })
      .returning();
    const [d] = await o
      .insert(dock)
      .values({
        tenantId: s.tenantId,
        siteId: s.siteId,
        hallId: first.hallId,
        code: `B-${i}`,
        doorType: 'dock_leveler',
        temperatureZone: 'ambient',
        status: 'active',
      })
      .returning();
    if (!r || !d) throw new Error('seed failed');
    const ids = { siteId: s.siteId, tenantId: s.tenantId };
    await o
      .insert(resourceDock)
      .values({ dockId: d.id, resourceId: r.id, resourceKind: 'single', ...ids });
    await o.insert(loadTypeResource).values({ loadTypeId: s.loadTypeId, resourceId: r.id, ...ids });
    created.push(r.id);
  }
  return created;
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.NaN;
}

async function measure(path: string): Promise<{ p95: number; starts: number }> {
  const samples: number[] = [];
  let starts = 0;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const res = await as(app, w.A.users.dispatcher).get(path);
    const body = (await res.json()) as { starts: unknown[] };
    samples.push(performance.now() - t0);
    expect(res.status).toBe(200);
    starts = body.starts.length;
  }
  return { p95: p95(samples), starts };
}

describe.skipIf(!process.env.BENCH)('availability at design load', () => {
  beforeAll(async () => {
    w = await world();
    const hours = [1, 2, 3, 4, 5, 6, 7].map(
      (d) => [d, '05:00', '22:00'] as [number, string, string],
    );
    bench = await capacitySite(w.A.tenantId, {
      kind: ResourceKind.single,
      hours,
      minutes: 60,
      buffer: 15,
    });
    resourceIds = await addResources(bench, RESOURCES);
    await insertBookings(bench, resourceIds, 31, 4);
    // Background: the rest of a month at design load (about 118,000 bookings) on other sites.
    for (let i = 0; i < 10; i++) {
      const other = await capacitySite(w.B.tenantId, { docks: 10, hours: [] });
      const pool = [other.resourceId as string];
      await insertBookings(other, pool, 31, 380);
    }
    await ownerDb().execute(sql`analyze`);
  }, 600_000);

  it('one resource-day under 200 ms p95', async () => {
    const r = await measure(
      `/api/t/${w.A.tenantId}/capacity/availability?siteId=${bench.siteId}&date=${DAY}&loadTypeId=${bench.loadTypeId}&resourceId=${resourceIds[3]}`,
    );
    console.log(`availability, 1 resource-day: p95 ${r.p95.toFixed(1)} ms, ${r.starts} starts`);
    expect(r.starts).toBeGreaterThan(0);
    expect(r.p95).toBeLessThan(200);
  });

  it(`a ${RESOURCES}-resource day under 1 s p95`, async () => {
    const r = await measure(
      `/api/t/${w.A.tenantId}/capacity/availability?siteId=${bench.siteId}&date=${DAY}&loadTypeId=${bench.loadTypeId}`,
    );
    console.log(
      `availability, ${RESOURCES} resources: p95 ${r.p95.toFixed(1)} ms, ${r.starts} starts`,
    );
    expect(r.starts).toBeGreaterThan(0);
    expect(r.p95).toBeLessThan(1000);
  });
});
