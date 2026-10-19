import type { KpiReport, VisitPage } from '@rampflow/shared/modules/report/api';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, type WorldUser, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import {
  bookableSite,
  type SeedBooking,
  seedBooking,
  setSetting,
} from '../../booking/lifecycle/fixtures.ts';
import { openingHours } from '../../booking/schema.resources.ts';
import { booking } from '../../booking/schema.ts';
import { appUser } from '../../core/schema.ts';

// RP-01 and RP-02 against the reference fixture of docs/reference/booking-lifecycle.md: ten
// visits on Tuesday 2026-11-10 in Europe/Berlin (CET, UTC+1), read on 2026-11-11 at 08:00.

const clock = testClock(new Date('2026-11-11T07:00:00Z'));
const app = createApp({ clock });

/** A wall time of 2026-11-10 in CET. */
const cet = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00+01:00`);

type Visit = SeedBooking & { set?: Partial<typeof booking.$inferInsert> };

const FIXTURE: Record<string, Visit> = {
  V1: {
    startsAt: cet('08:00'),
    createdParty: 'carrier',
    status: 'departed',
    set: {
      checkedInAt: cet('07:50'),
      atDockAt: cet('08:05'),
      doneAt: cet('08:50'),
      departedAt: cet('09:00'),
      punctuality: 'on_time',
      punctualityMinutes: -10,
    },
  },
  V2: {
    startsAt: cet('09:00'),
    createdParty: 'carrier',
    status: 'departed',
    set: {
      checkedInAt: cet('08:20'),
      atDockAt: cet('09:10'),
      doneAt: cet('10:00'),
      departedAt: cet('10:15'),
      punctuality: 'early',
      punctualityMinutes: -40,
    },
  },
  V3: {
    startsAt: cet('10:00'),
    createdParty: 'staff',
    status: 'departed',
    set: {
      checkedInAt: cet('10:30'),
      calledAt: cet('10:35'),
      atDockAt: cet('10:40'),
      loadingAt: cet('10:45'),
      doneAt: cet('11:40'),
      departedAt: cet('12:45'),
      punctuality: 'late',
      punctualityMinutes: 30,
    },
  },
  V4: {
    startsAt: cet('11:00'),
    createdParty: 'carrier',
    status: 'departed',
    noShowAt: cet('12:00'),
    set: {
      checkedInAt: cet('12:30'),
      atDockAt: cet('12:40'),
      doneAt: cet('13:20'),
      departedAt: cet('13:30'),
      punctuality: 'late',
      punctualityMinutes: 90,
    },
  },
  V5: {
    startsAt: cet('12:00'),
    createdParty: 'carrier',
    status: 'no_show',
    noShowAt: cet('13:00'),
  },
  V6: {
    startsAt: cet('13:00'),
    createdParty: 'carrier',
    status: 'cancelled',
    set: { cancelledAt: cet('12:00'), cancelledLate: true },
  },
  V7: {
    startsAt: cet('14:00'),
    createdParty: 'carrier',
    status: 'cancelled',
    set: { cancelledAt: cet('08:00'), cancelledLate: false },
  },
  V8: {
    startsAt: cet('15:00'),
    createdParty: 'staff',
    status: 'departed',
    set: {
      checkedInAt: cet('14:55'),
      loadingAt: cet('15:05'),
      doneAt: cet('15:45'),
      departedAt: cet('15:50'),
      punctuality: 'on_time',
      punctualityMinutes: -5,
    },
  },
  V9: {
    startsAt: cet('16:00'),
    createdParty: 'staff',
    walkIn: true,
    status: 'departed',
    set: {
      checkedInAt: cet('16:10'),
      atDockAt: cet('16:20'),
      doneAt: cet('17:00'),
      departedAt: cet('17:10'),
    },
  },
  V10: {
    startsAt: cet('17:00'),
    createdParty: 'carrier',
    status: 'done',
    set: {
      checkedInAt: cet('16:50'),
      atDockAt: cet('17:00'),
      doneAt: cet('17:30'),
      punctuality: 'on_time',
      punctualityMinutes: -10,
    },
  },
};

const codes: Record<string, string> = {};
let w: World;

async function seedVisit(side: World['A'], v: Visit, site?: 0 | 1) {
  const s = side.sites[site ?? 0];
  const row = await seedBooking(side, {
    ...v,
    site: {
      siteId: s.id,
      resourceId: s.resourceId,
      loadTypeId: s.loadTypeId,
      zone: 'Europe/Berlin',
    } as never,
  });
  if (v.set) await ownerDb().update(booking).set(v.set).where(eq(booking.id, row.id));
  return row;
}

const setLocale = (u: WorldUser, locale: 'de' | 'en') =>
  ownerDb().update(appUser).set({ locale }).where(eq(appUser.id, u.id));

beforeAll(async () => {
  w = await world();
  const open: [number, string, string][] = [1, 2, 3, 4, 5, 6, 7].map((d) => [d, '06:00', '22:00']);
  await bookableSite(w.A, ownerDb(), open);
  const by = w.A.users.tenant_admin.id;
  await setSetting(w.A.tenantId, 'yard.early_tolerance_minutes', 30, by);
  await setSetting(w.A.tenantId, 'yard.grace_minutes', 15, by);
  await setSetting(w.A.tenantId, 'yard.no_show_after_minutes', 60, by);
  await setSetting(w.A.tenantId, 'yard.standgeld_flag_minutes', 120, by);
  await setSetting(w.A.tenantId, 'booking.cancel_cutoff_minutes', 120, by);
  for (const [name, v] of Object.entries(FIXTURE)) codes[name] = (await seedVisit(w.A, v)).code;
});

const kpisOf = async (query: Record<string, string>, user = w.A.users.dispatcher) => {
  const res = await as(app, user).get(
    `/api/t/${w.A.tenantId}/reports/kpis?${new URLSearchParams(query)}`,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as KpiReport;
};

const day = (from: string, to = from, siteIndex: 0 | 1 = 0) => ({
  siteId: w.A.sites[siteIndex].id,
  from,
  to,
});

describe('RP-01 KPI dashboard', () => {
  it('returns exactly the expected values of the reference fixture', async () => {
    const report = await kpisOf(day('2026-11-10'));
    expect(report.site).toMatchObject({ id: w.A.sites[0].id, timeZone: 'Europe/Berlin' });
    expect(report.kpis).toEqual({
      bookingsDue: 8,
      noShowRate: 25,
      lateCancellationRate: 12.5,
      onTimeRate: 50,
      earlyRate: 16.7,
      lateRate: 33.3,
      waitMinutes: 7.5,
      dockDwellMinutes: 44.2,
      turnaroundMinutes: 82.5,
      dockUtilisation: 13.8,
      portalAdoption: 70,
      standgeldVisits: 1,
    });
  });

  it('gives null for every rate and mean without a denominator', async () => {
    const report = await kpisOf(day('2026-11-09'));
    expect(report.kpis).toMatchObject({
      bookingsDue: 0,
      noShowRate: null,
      onTimeRate: null,
      waitMinutes: null,
      turnaroundMinutes: null,
      portalAdoption: null,
      dockUtilisation: 0,
      standgeldVisits: 0,
    });
  });

  it('leaves a visit missing a timestamp out of the KPIs that need it only', async () => {
    await seedVisit(w.A, {
      startsAt: new Date('2026-11-12T09:00:00Z'),
      createdParty: 'carrier',
      status: 'departed',
      set: {
        checkedInAt: new Date('2026-11-12T08:55:00Z'),
        departedAt: new Date('2026-11-12T09:40:00Z'),
        punctuality: 'on_time',
        punctualityMinutes: -5,
      },
    });
    clock.set(new Date('2026-11-13T07:00:00Z'));
    try {
      const report = await kpisOf(day('2026-11-12'));
      expect(report.kpis).toMatchObject({
        bookingsDue: 1,
        onTimeRate: 100,
        turnaroundMinutes: 45,
        waitMinutes: null,
        dockDwellMinutes: null,
      });
    } finally {
      clock.set(new Date('2026-11-11T07:00:00Z'));
    }
  });

  it('counts a booking not yet started as not due', async () => {
    clock.set(cet('12:30'));
    try {
      // By 12:30 V1 to V5 have started; V6 and later lie ahead.
      expect((await kpisOf(day('2026-11-10'))).kpis.bookingsDue).toBe(5);
    } finally {
      clock.set(new Date('2026-11-11T07:00:00Z'));
    }
  });

  it('filters by resource and carrier', async () => {
    const other = await kpisOf({ ...day('2026-11-10'), carrierId: w.A.rivalCarrierId });
    expect(other.kpis.bookingsDue).toBe(0);
    const own = await kpisOf({ ...day('2026-11-10'), carrierId: w.A.carrierId });
    expect(own.kpis.bookingsDue).toBe(8);
    const pool = await kpisOf({ ...day('2026-11-10'), resourceId: w.A.sites[0].resourceId });
    expect(pool.kpis).toMatchObject({ bookingsDue: 8, dockUtilisation: 13.8 });
  });

  it('answers 404 for a resource of another site and 422 for a reversed period', async () => {
    const foreign = await as(app, w.A.users.dispatcher).get(
      `/api/t/${w.A.tenantId}/reports/kpis?${new URLSearchParams({
        ...day('2026-11-10'),
        resourceId: w.A.sites[1].resourceId,
      })}`,
    );
    expect(foreign.status).toBe(404);
    const reversed = await as(app, w.A.users.dispatcher).get(
      `/api/t/${w.A.tenantId}/reports/kpis?${new URLSearchParams(day('2026-11-11', '2026-11-10'))}`,
    );
    expect(reversed.status).toBe(422);
  });

  it('holds site-local days across the DST change of 2026-10-25', async () => {
    const s = w.A.sites[1];
    await ownerDb()
      .insert(openingHours)
      .values(
        [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          tenantId: w.A.tenantId,
          siteId: s.id,
          weekday,
          opens: '00:00',
          closes: '24:00',
        })),
      );
    const visit = (startsAt: string, set?: Visit['set']): Visit => ({
      startsAt: new Date(startsAt),
      createdParty: 'carrier',
      status: set ? 'departed' : 'confirmed',
      set,
    });
    // 00:30 CEST and 23:30 CET on the 25th belong to the day; 23:30 CEST on the 24th and 00:30
    // CET on the 26th do not.
    await seedVisit(w.A, visit('2026-10-24T22:30:00Z'), 1);
    await seedVisit(
      w.A,
      visit('2026-10-25T22:30:00Z', {
        checkedInAt: new Date('2026-10-25T22:30:00Z'),
        atDockAt: new Date('2026-10-25T22:30:00Z'),
        doneAt: new Date('2026-10-25T23:45:00Z'),
        departedAt: new Date('2026-10-25T23:50:00Z'),
        punctuality: 'on_time',
        punctualityMinutes: 0,
      }),
      1,
    );
    await seedVisit(w.A, { ...visit('2026-10-24T21:30:00Z'), createdParty: 'staff' }, 1);
    await seedVisit(w.A, { ...visit('2026-10-25T23:30:00Z'), createdParty: 'staff' }, 1);

    const report = await kpisOf(day('2026-10-25', '2026-10-25', 1));
    // Two bookings, both by carriers; the day has 25 hours: 75 / (2 docks × 1,500 minutes).
    expect(report.kpis).toMatchObject({ portalAdoption: 100, dockUtilisation: 2.5 });
  });
});

describe('RP-02 visit list and CSV export', () => {
  it('pages through the visits of the period by start with every timestamp', async () => {
    const seen: VisitPage['items'] = [];
    let cursor: string | null = null;
    do {
      const query: Record<string, string> = { ...day('2026-11-10'), limit: '4' };
      if (cursor) query.cursor = cursor;
      const res = await as(app, w.A.users.dispatcher).get(
        `/api/t/${w.A.tenantId}/reports/visits?${new URLSearchParams(query)}`,
      );
      expect(res.status).toBe(200);
      const page = (await res.json()) as VisitPage;
      seen.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen.map((v) => v.code)).toEqual(Object.values(codes));
    expect(seen[2]).toMatchObject({
      status: 'departed',
      startsAt: '2026-11-10T09:00:00.000Z',
      checkedInAt: '2026-11-10T09:30:00.000Z',
      calledAt: '2026-11-10T09:35:00.000Z',
      atDockAt: '2026-11-10T09:40:00.000Z',
      loadingAt: '2026-11-10T09:45:00.000Z',
      doneAt: '2026-11-10T10:40:00.000Z',
      departedAt: '2026-11-10T11:45:00.000Z',
      punctuality: 'late',
      waitMinutes: 10,
      dockDwellMinutes: 60,
      turnaroundMinutes: 135,
    });
  });

  const download = async (path: string, user: WorldUser) => {
    const res = await as(app, user).get(
      `/api/t/${w.A.tenantId}/reports/${path}?${new URLSearchParams(day('2026-11-10'))}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    return new TextDecoder().decode(bytes.slice(3)).split('\r\n');
  };

  it('exports the KPI table with ; and decimal commas for a de user', async () => {
    await setLocale(w.A.users.dispatcher, 'de');
    const lines = await download('kpis.csv', w.A.users.dispatcher);
    expect(lines[0]).toBe('Standort;Von;Bis;Kennzahl;Wert;Einheit');
    expect(lines).toContain(`${'Site 1'};2026-11-10;2026-11-10;No-Show-Quote;25,0;%`);
    expect(lines).toContain('Site 1;2026-11-10;2026-11-10;Fällige Buchungen;8;Anzahl');
  });

  it('exports the KPI table with , and decimal points for an en user', async () => {
    await setLocale(w.A.users.tenant_admin, 'en');
    const lines = await download('kpis.csv', w.A.users.tenant_admin);
    expect(lines[0]).toBe('Site,From,To,KPI,Value,Unit');
    expect(lines).toContain('Site 1,2026-11-10,2026-11-10,Dock dwell,44.2,min');
  });

  it('exports the visits with ISO 8601 timestamps in the site offset', async () => {
    await setLocale(w.A.users.tenant_admin, 'en');
    const lines = await download('visits.csv', w.A.users.tenant_admin);
    const header = lines[0]?.split(',') ?? [];
    expect(header.slice(0, 3)).toEqual(['Booking code', 'Status', 'Carrier']);
    const v1 = lines.find((l) => l.startsWith(`${codes.V1},`))?.split(',') ?? [];
    const col = (name: string) => v1[header.indexOf(name)];
    expect(col('Start')).toBe('2026-11-10T08:00:00+01:00');
    expect(col('Checked in')).toBe('2026-11-10T07:50:00+01:00');
    expect(col('Punctuality (min)')).toBe('-10');
    expect(col('Departed')).toBe('2026-11-10T09:00:00+01:00');
    expect(lines).toHaveLength(12);
  });
});
