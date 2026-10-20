import { BookingStatus, Direction, Punctuality } from '@rampflow/shared/modules/booking/values';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { type CapacitySite, capacitySite } from '../../booking/capacity/fixtures.ts';
import { booking } from '../../booking/schema.ts';

// RP-01 at design load (mvp-scope, "Performance"): KPIs for one site over 90 days in 2 s p95.
// 120,000 bookings a month over 100 sites is 1,200 per site and month; the measured site gets
// three times that, every visit fully stamped, among 90 days of design load on other sites.
// Runs with `pnpm bench` only.

const RUNS = 20;
const DAYS = 90;
const NOW = new Date('2027-02-01T12:00:00Z');
const FIRST_DAY = Date.parse('2026-11-03T00:00:00Z');
const MINUTE = 60_000;

const clock = testClock(NOW);
const app = createApp({ clock });
let w: World;
let site: CapacitySite;
let codes = 0;

async function insertVisits(s: CapacitySite, perDay: number) {
  const rows = [];
  for (let d = 0; d < DAYS; d++) {
    for (let k = 0; k < perDay; k++) {
      const startsAt = new Date(FIRST_DAY + d * 86_400_000 + (5 * 60 + ((k * 7) % 960)) * MINUTE);
      const checkedInAt = new Date(startsAt.getTime() + ((k % 50) - 25) * MINUTE);
      const atDockAt = new Date(startsAt.getTime() + (k % 30) * MINUTE);
      const doneAt = new Date(atDockAt.getTime() + (30 + (k % 60)) * MINUTE);
      const endsAt = new Date(startsAt.getTime() + 60 * MINUTE);
      rows.push({
        tenantId: s.tenantId,
        siteId: s.siteId,
        resourceId: s.resourceId,
        loadTypeId: s.loadTypeId,
        carrierName: 'Bench',
        code: `K${String(codes++).padStart(7, '0')}`,
        status: BookingStatus.departed,
        direction: Direction.inbound,
        startsAt,
        endsAt,
        blocksUntil: endsAt,
        siteTimeZone: s.zone,
        loadUnits: 20,
        createdParty: k % 3 === 0 ? ('staff' as const) : ('carrier' as const),
        punctuality: Punctuality.on_time,
        punctualityMinutes: (k % 50) - 25,
        checkedInAt,
        atDockAt,
        doneAt,
        departedAt: new Date(doneAt.getTime() + 10 * MINUTE),
      });
    }
  }
  for (let i = 0; i < rows.length; i += 2000) {
    await ownerDb()
      .insert(booking)
      .values(rows.slice(i, i + 2000));
  }
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.NaN;
}

describe.skipIf(!process.env.BENCH)('KPIs at design load', () => {
  beforeAll(async () => {
    w = await world();
    const hours = [1, 2, 3, 4, 5, 6, 7].map(
      (d) => [d, '05:00', '22:00'] as [number, string, string],
    );
    site = await capacitySite(w.A.tenantId, { docks: 10, hours });
    await insertVisits(site, 120);
    // Background: three months at design load on other sites, about 360,000 bookings.
    for (let i = 0; i < 10; i++) {
      await insertVisits(await capacitySite(w.B.tenantId, { docks: 10, hours: [] }), 400);
    }
    await ownerDb().execute(sql`analyze`);
  }, 900_000);

  it('one site over 90 days under 2 s p95', async () => {
    const path = `/api/t/${w.A.tenantId}/reports/kpis?siteId=${site.siteId}&from=2026-11-03&to=2027-01-31`;
    const samples: number[] = [];
    let due = 0;
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const res = await as(app, w.A.users.dispatcher).get(path);
      const body = (await res.json()) as { kpis: { bookingsDue: number } };
      samples.push(performance.now() - t0);
      expect(res.status).toBe(200);
      due = body.kpis.bookingsDue;
    }
    console.log(`kpis, 1 site over ${DAYS} days: p95 ${p95(samples).toFixed(1)} ms, ${due} due`);
    expect(due).toBe(DAYS * 120);
    expect(p95(samples)).toBeLessThan(2000);
  });
});
