import { ClosureKind } from '@rampflow/shared/modules/booking/values';
import { hoursTemplateRows, SubdivisionCode } from '@rampflow/shared/modules/core/api.sites';
import { SiteCountry } from '@rampflow/shared/modules/core/values';
import { values } from '@rampflow/shared/values';
import Holidays from 'date-holidays';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { SiteId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { runJobTick } from '../../../kernel/jobs.ts';
import { closure } from '../schema.resources.ts';
import { holidayRegions, job } from './holiday-import.ts';

const clock = testClock(new Date('2026-10-19T08:00:00Z'));
const app = createApp({ clock });
const mailer = { send: async () => undefined };

let w: World;
let siteId: SiteId;
beforeAll(async () => {
  w = await world();
  const res = await as(app, w.A.users.tenant_admin).post(`/api/t/${w.A.tenantId}/sites`, {
    body: {
      name: 'Lager München',
      addressLine1: 'Landsberger Str. 1',
      postalCode: '80339',
      city: 'München',
      country: 'DE',
      subdivision: 'DE-BY',
      timeZone: 'Europe/Berlin',
      defaultLocale: 'de',
      hours: hoursTemplateRows.one_shift,
    },
  });
  siteId = ((await res.json()) as { id: SiteId }).id;
});

const holidays = async () =>
  (
    await ownerDb()
      .select()
      .from(closure)
      .where(and(eq(closure.siteId, siteId), eq(closure.source, 'holiday')))
  ).sort((a, b) => (a.holidayDate ?? '').localeCompare(b.holidayDate ?? ''));

describe('holiday import (MD-04)', () => {
  it('creates the DE-BY public holidays of the next 400 days as all-day closures', async () => {
    const rows = await holidays();
    expect(rows.map((r) => r.holidayDate)).toEqual([
      '2026-11-01',
      '2026-12-25',
      '2026-12-26',
      '2027-01-01',
      '2027-01-06',
      '2027-03-26',
      '2027-03-29',
      '2027-05-01',
      '2027-05-06',
      '2027-05-17',
      '2027-05-27',
      '2027-10-03',
      '2027-11-01',
    ]);
    expect(rows[1]).toMatchObject({
      kind: ClosureKind.closed,
      startsLocal: '2026-12-25 00:00:00',
      endsLocal: '2026-12-26 00:00:00',
      holidayName: '1. Weihnachtstag',
      reopenedAt: null,
    });
  });

  it('changes nothing when it runs again after a reopen', async () => {
    const [allSaints] = await holidays();
    const reopen = await as(app, w.A.users.tenant_admin).post(
      `/api/t/${w.A.tenantId}/capacity/closures/${allSaints?.id}/reopen`,
    );
    expect(reopen.status).toBe(200);
    const before = await holidays();
    const tick = await runJobTick(job, { clock, mailer });
    expect(tick.ran).toBe(true);
    expect(await holidays()).toEqual(before);
    expect(before[0]?.reopenedAt).not.toBeNull();
  });

  it('extends the window as days pass', async () => {
    clock.set(new Date('2026-11-25T08:00:00Z'));
    await runJobTick(job, { clock, mailer });
    const dates = (await holidays()).map((r) => r.holidayDate);
    expect(dates).toContain('2027-12-25');
    expect(dates).toContain('2026-11-01');
  });
});

describe('site countries', () => {
  it('offer only regions a site can store', () => {
    const offered = values(SiteCountry).flatMap(holidayRegions);
    expect(offered.filter((r) => !SubdivisionCode.safeParse(r.code).success)).toEqual([]);
    expect(holidayRegions('DE')).toHaveLength(16);
  });

  it('each have a holiday calendar', () => {
    const calendars = new Holidays().getCountries();
    expect(values(SiteCountry).filter((c) => !(c in calendars))).toEqual([]);
  });
});
