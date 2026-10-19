import { instantsAt, type LocalDate, type LocalTime, wallClock } from '@rampflow/shared/time';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { type World, world } from '../../../../test/world.ts';
import { wrapJson } from '../../../db/ids.ts';
import { settingValue } from '../../core/schema.ts';
import { closure, openingHours } from '../schema.resources.ts';
import {
  asTenantAdmin,
  type CapacitySite,
  type CapacitySiteOptions,
  capacitySite,
  placeBooking,
} from './fixtures.ts';
import { loadDayTimeline } from './load.ts';
import { offersFor } from './offers.ts';
import { checkFit } from './timeline.ts';

let w: World;
beforeAll(async () => {
  w = await world();
});

const MONDAY = '2026-11-02' as LocalDate;
const ALL_WEEK: CapacitySiteOptions['hours'] = [1, 2, 3, 4, 5, 6, 7].map((d) => [
  d,
  '00:00',
  '24:00',
]);

const newSite = (o: Partial<CapacitySiteOptions> = {}) =>
  capacitySite(w.A.tenantId, { hours: [[1, '06:00', '14:00']], ...o });

/** Instant of a wall time; the earlier one in a fold. */
const at = (s: CapacitySite, day: string, time: string) => {
  const [first] = instantsAt(day as LocalDate, time as LocalTime, s.zone);
  if (!first) throw new Error(`${day} ${time} does not exist in ${s.zone}`);
  return first;
};

async function offers(
  s: CapacitySite,
  day: LocalDate,
  o: { audience?: 'staff' | 'carrier'; now?: Date } = {},
) {
  return asTenantAdmin(
    w.A,
    (tx, access) =>
      offersFor(
        tx,
        {
          access: { setting: access.setting, entitlements: access.entitlements ?? never() },
          now: o.now ?? new Date('2026-10-19T08:00:00Z'),
        },
        {
          tenantId: s.tenantId,
          siteId: s.siteId,
          day,
          loadTypeId: s.loadTypeId,
          loadUnits: 0,
          audience: o.audience ?? 'staff',
        },
      ),
    o.now,
  );
}

function never(): never {
  throw new Error('tenant scope without entitlements');
}

const wallTimes = (o: Awaited<ReturnType<typeof offers>>) =>
  o.starts.map((s) => (s.fold ? `${s.wallTime} ${s.fold}` : s.wallTime));

const setSetting = (s: CapacitySite, key: string, value: unknown) =>
  ownerDb()
    .insert(settingValue)
    .values({
      tenantId: s.tenantId,
      siteId: s.siteId,
      key,
      value: wrapJson(value),
      updatedBy: w.platformAdmin.id,
    });

describe('offered starts (MD-04)', () => {
  it('lie inside opening hours, on the grid, and leave room for duration and buffer', async () => {
    const s = await newSite({ minutes: 60, buffer: 30 });
    const o = await offers(s, MONDAY);
    expect(o.durationMinutes).toBe(60);
    expect(o.gridMinutes).toBe(30);
    expect(wallTimes(o)).toEqual([
      '06:00',
      '06:30',
      '07:00',
      '07:30',
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
    ]);
    expect((await offers(s, '2026-11-03' as LocalDate)).starts).toEqual([]);
  });

  it('follow booking.slot_grid_minutes of the site', async () => {
    const s = await newSite({ minutes: 60 });
    await setSetting(s, 'booking.slot_grid_minutes', 60);
    expect(wallTimes(await offers(s, MONDAY))).toEqual([
      '06:00',
      '07:00',
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
    ]);
  });

  it('narrow to the resource hours when the resource has its own', async () => {
    const s = await newSite({ minutes: 60 });
    await ownerDb().insert(openingHours).values({
      tenantId: s.tenantId,
      siteId: s.siteId,
      resourceId: s.resourceId,
      weekday: 1,
      opens: '10:00',
      closes: '18:00',
    });
    expect(wallTimes(await offers(s, MONDAY))).toEqual([
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '13:00',
    ]);
  });

  it('skip closures and blocks of the site and of the resource', async () => {
    const s = await newSite({ minutes: 60 });
    await ownerDb()
      .insert(closure)
      .values([
        {
          tenantId: s.tenantId,
          siteId: s.siteId,
          kind: 'closed',
          source: 'manual',
          startsLocal: `${MONDAY}T08:00`,
          endsLocal: `${MONDAY}T09:00`,
        },
        {
          tenantId: s.tenantId,
          siteId: s.siteId,
          resourceId: s.resourceId,
          kind: 'blocked',
          source: 'manual',
          startsLocal: `${MONDAY}T11:00`,
          endsLocal: `${MONDAY}T14:00`,
        },
      ]);
    expect(wallTimes(await offers(s, MONDAY))).toEqual([
      '06:00',
      '06:30',
      '07:00',
      '09:00',
      '09:30',
      '10:00',
    ]);
  });

  it('skip a public holiday unless the setting is off or the date is reopened', async () => {
    const s = await newSite({ minutes: 60 });
    const [holiday] = await ownerDb()
      .insert(closure)
      .values({
        tenantId: s.tenantId,
        siteId: s.siteId,
        kind: 'closed',
        source: 'holiday',
        holidayDate: MONDAY,
        holidayName: 'Testfeiertag',
        startsLocal: `${MONDAY}T00:00`,
        endsLocal: '2026-11-03T00:00',
      })
      .returning();
    expect((await offers(s, MONDAY)).starts).toEqual([]);
    await setSetting(s, 'booking.close_on_public_holidays', false);
    expect((await offers(s, MONDAY)).starts).toHaveLength(15);
    await ownerDb().delete(settingValue).where(eq(settingValue.siteId, s.siteId));
    expect((await offers(s, MONDAY)).starts).toEqual([]);
    await ownerDb()
      .update(closure)
      .set({ reopenedAt: new Date() })
      .where(eq(closure.id, holiday?.id ?? never()));
    expect((await offers(s, MONDAY)).starts).toHaveLength(15);
  });

  it('count load against active docks and the capacity cap', async () => {
    const s = await newSite({ docks: 2, minutes: 60 });
    await placeBooking(s, at(s, MONDAY, '08:00'), 60);
    await placeBooking(s, at(s, MONDAY, '08:00'), 120);
    await placeBooking(s, at(s, MONDAY, '06:00'), 60, 'cancelled');
    const free = wallTimes(await offers(s, MONDAY));
    expect(free).toContain('06:00');
    expect(free).toContain('07:00');
    expect(free).not.toContain('07:30');
    expect(free).not.toContain('08:30');
    expect(free).toContain('09:00');
    expect(free).toContain('10:00');
  });

  it('stop at the daily cap of starts on the site-local day', async () => {
    const s = await newSite({ docks: 3, dailyCap: 2, minutes: 60 });
    await placeBooking(s, at(s, '2026-11-01', '23:30'), 30);
    await placeBooking(s, at(s, MONDAY, '06:00'), 60);
    expect((await offers(s, MONDAY)).starts.length).toBeGreaterThan(0);
    await placeBooking(s, at(s, MONDAY, '12:00'), 60);
    expect((await offers(s, MONDAY)).starts).toEqual([]);
    const day = await asTenantAdmin(w.A, (tx, access) =>
      loadDayTimeline(tx, access, { tenantId: s.tenantId, siteId: s.siteId, day: MONDAY }),
    );
    const timeline = day.resources[0]?.timeline ?? never();
    expect(checkFit(timeline, at(s, MONDAY, '09:00'), 60)).toEqual({
      ok: false,
      reason: 'daily_cap_reached',
    });
  });

  it('give carriers only starts between now plus the lead time and the horizon', async () => {
    const s = await newSite({ minutes: 60 });
    const now = at(s, MONDAY, '07:10');
    const carrier = wallTimes(await offers(s, MONDAY, { audience: 'carrier', now }));
    expect(carrier[0]).toBe('09:30');
    expect(wallTimes(await offers(s, MONDAY, { audience: 'staff', now }))[0]).toBe('06:00');
    const far = '2026-12-14' as LocalDate;
    expect((await offers(s, far, { audience: 'carrier', now })).starts).toEqual([]);
    expect((await offers(s, far, { audience: 'staff', now })).starts.length).toBeGreaterThan(0);
  });
});

describe('capacity across DST and midnight (ADR-0004)', () => {
  it('a booking at 02:30 earlier on 2026-10-25 leaves 02:30 later offered', async () => {
    const s = await newSite({ kind: 'single', hours: ALL_WEEK, minutes: 60 });
    const [earlier] = instantsAt('2026-10-25' as LocalDate, '02:30' as LocalTime, s.zone);
    await placeBooking(s, earlier ?? never(), 60);
    const free = wallTimes(await offers(s, '2026-10-25' as LocalDate));
    expect(free).toContain('02:30 later');
    expect(free).not.toContain('02:30 earlier');
    expect(free).not.toContain('02:00 later');
    expect(free).not.toContain('02:00 earlier');
    expect(free).toContain('01:00');
  });

  it('2027-03-28 has 276 buckets and 46 grid starts', async () => {
    const s = await newSite({ kind: 'single', hours: ALL_WEEK, minutes: 30 });
    const day = '2027-03-28' as LocalDate;
    const timeline = await asTenantAdmin(w.A, (tx, access) =>
      loadDayTimeline(tx, access, { tenantId: s.tenantId, siteId: s.siteId, day }),
    );
    const { start, end } = timeline.range;
    expect((end.getTime() - start.getTime()) / (5 * 60_000)).toBe(276);
    expect((await offers(s, day)).starts).toHaveLength(46);
  });

  it('an overnight shift offers Mon 23:30 for 90 minutes, which then blocks Tue 00:30', async () => {
    const s = await newSite({
      kind: 'single',
      minutes: 90,
      hours: [
        [1, '22:00', '24:00'],
        [2, '00:00', '06:00'],
      ],
    });
    expect(wallTimes(await offers(s, MONDAY))).toEqual(['22:00', '22:30', '23:00', '23:30']);
    await placeBooking(s, at(s, MONDAY, '23:30'), 90);
    const tuesday = wallTimes(await offers(s, '2026-11-03' as LocalDate));
    expect(tuesday).not.toContain('00:00');
    expect(tuesday).not.toContain('00:30');
    expect(tuesday[0]).toBe('01:00');
    expect(wallClock(at(s, MONDAY, '23:30'), s.zone).day).toBe(MONDAY);
  });
});
