import { ClosureKind, ClosureSource } from '@rampflow/shared/modules/booking/values';
import {
  addDays,
  type LocalDate,
  type LocalDateTime,
  siteDay,
  type TimeZone,
} from '@rampflow/shared/time';
import { JobName } from '@rampflow/shared/values';
import Holidays from 'date-holidays';
import { and, eq, gte, isNull, notInArray } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { forEachTenant, type Job } from '../../../kernel/jobs.ts';
import { site } from '../../core/schema.ts';
import { closure } from '../schema.resources.ts';

/** Public holidays exist as closures for this many days ahead (MD-04). */
export const HOLIDAY_HORIZON_DAYS = 400;

export interface HolidaySite {
  id: SiteId;
  tenantId: TenantId;
  country: string;
  subdivision: string | null;
  timeZone: string;
  defaultLocale: string;
}

const calendars = new Map<string, Holidays>();
function calendar(country: string, subdivision: string | null): Holidays {
  const region = subdivision?.slice(country.length + 1);
  const key = `${country}-${region ?? ''}`;
  let hd = calendars.get(key);
  if (!hd) {
    hd = new Holidays(country, region ?? '', { types: ['public'] });
    calendars.set(key, hd);
  }
  return hd;
}

/** The public holidays of the site's country and subdivision in `[from, from + days)`, by date. */
export function publicHolidays(
  s: Pick<HolidaySite, 'country' | 'subdivision' | 'defaultLocale'>,
  from: LocalDate,
  days: number,
): Map<LocalDate, string> {
  const to = addDays(from, days);
  const hd = calendar(s.country, s.subdivision);
  const out = new Map<LocalDate, string>();
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const h of hd.getHolidays(year, s.defaultLocale) || []) {
      if (h.type !== 'public') continue;
      const date = h.date.slice(0, 10) as LocalDate;
      if (date < from || date >= to) continue;
      const known = out.get(date);
      out.set(date, known ? `${known}, ${h.name}` : h.name);
    }
  }
  return out;
}

/**
 * Makes the site's holiday closures from today on match its region's public holidays for the
 * next 400 days. Idempotent: existing dates stay, a reopened date is never re-imported, and
 * dates of a former region are removed unless reopened.
 */
export async function syncHolidays(tx: Tx, s: HolidaySite, now: Date): Promise<number> {
  const today = siteDay(now, s.timeZone as TimeZone);
  const holidays = publicHolidays(s, today, HOLIDAY_HORIZON_DAYS);
  const dates = [...holidays.keys()];
  await tx
    .delete(closure)
    .where(
      and(
        eq(closure.tenantId, s.tenantId),
        eq(closure.siteId, s.id),
        eq(closure.source, 'holiday'),
        isNull(closure.reopenedAt),
        gte(closure.holidayDate, today),
        dates.length > 0 ? notInArray(closure.holidayDate, dates) : undefined,
      ),
    );
  if (dates.length === 0) return 0;
  const inserted = await tx
    .insert(closure)
    .values(
      dates.map((date) => ({
        tenantId: s.tenantId,
        siteId: s.id,
        kind: ClosureKind.closed,
        startsLocal: `${date}T00:00` as LocalDateTime,
        endsLocal: `${addDays(date, 1)}T00:00` as LocalDateTime,
        source: ClosureSource.holiday,
        holidayDate: date,
        holidayName: holidays.get(date) ?? null,
      })),
    )
    .onConflictDoNothing({
      target: [closure.siteId, closure.holidayDate],
      where: eq(closure.source, 'holiday'),
    })
    .returning({ id: closure.id });
  return inserted.length;
}

/** Daily: keeps the 400-day holiday window of every active site filled. */
export const job: Job = {
  name: JobName.booking_holiday_import,
  everySeconds: 24 * 3600,
  run: (ctx) =>
    forEachTenant(ctx, JobName.booking_holiday_import, async (tx, tenantId) => {
      const sites = await tx
        .select()
        .from(site)
        .where(and(eq(site.tenantId, tenantId), eq(site.active, true)));
      let closures = 0;
      for (const s of sites) closures += await syncHolidays(tx, s, ctx.clock.now());
      return { sites: sites.length, closures };
    }),
};
