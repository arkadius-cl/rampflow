import * as z from 'zod';
import { type LocalDate, localDateSchema } from '../../time/index.ts';
import { ZodIssueCode } from '../../values/validation.ts';
import { BookingStatus, CreatedParty, Punctuality } from '../booking/values.ts';
import { KpiKey, KpiUnit } from './values.ts';

export { KpiKey };

// Request schemas and response shapes of /api/t/:orgId/reports (RP-01, RP-02). The KPI
// definitions are binding in docs/reference/booking-lifecycle.md, "KPIs".

/** The longest period one report covers: a year of site-local days. */
export const MAX_PERIOD_DAYS = 366;

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/** Days of the period, both ends included. */
export const periodDays = (from: LocalDate, to: LocalDate) => dayNumber(to) - dayNumber(from) + 1;

const filterShape = {
  siteId: z.uuid(),
  from: localDateSchema,
  to: localDateSchema,
  resourceId: z.uuid().optional(),
  carrierId: z.uuid().optional(),
};

function checkPeriod(f: { from: LocalDate; to: LocalDate }, ctx: z.RefinementCtx) {
  if (f.from > f.to) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      message: 'The period ends before it starts',
      path: ['to'],
    });
  } else if (periodDays(f.from, f.to) > MAX_PERIOD_DAYS) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      message: `A report covers at most ${MAX_PERIOD_DAYS} days`,
      path: ['to'],
    });
  }
}

/** Site, site-local date range and the optional resource and carrier filters. */
export const ReportFilter = z.object(filterShape).superRefine(checkPeriod);
export type ReportFilter = z.infer<typeof ReportFilter>;

/** The visit list (RP-02): the filter plus cursor paging. */
export const VisitQuery = z
  .object({
    ...filterShape,
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().max(200).optional(),
  })
  .superRefine(checkPeriod);
export type VisitQuery = z.infer<typeof VisitQuery>;

/**
 * The KPI table of RP-01 in display order: the dashboard, the API and the CSV all walk it.
 * Rates are percentages and durations mean minutes, rounded to one decimal; `null` means an
 * empty denominator, shown as "–".
 */
export const KPIS = [
  { key: KpiKey.bookingsDue, unit: KpiUnit.count },
  { key: KpiKey.noShowRate, unit: KpiUnit.percent },
  { key: KpiKey.lateCancellationRate, unit: KpiUnit.percent },
  { key: KpiKey.onTimeRate, unit: KpiUnit.percent },
  { key: KpiKey.earlyRate, unit: KpiUnit.percent },
  { key: KpiKey.lateRate, unit: KpiUnit.percent },
  { key: KpiKey.waitMinutes, unit: KpiUnit.minutes },
  { key: KpiKey.dockDwellMinutes, unit: KpiUnit.minutes },
  { key: KpiKey.turnaroundMinutes, unit: KpiUnit.minutes },
  { key: KpiKey.dockUtilisation, unit: KpiUnit.percent },
  { key: KpiKey.portalAdoption, unit: KpiUnit.percent },
  { key: KpiKey.standgeldVisits, unit: KpiUnit.count },
] as const satisfies readonly { key: KpiKey; unit: KpiUnit }[];

export type Kpis = { [K in KpiKey]: number | null };

export interface KpiReport {
  site: { id: string; name: string; timeZone: string };
  from: LocalDate;
  to: LocalDate;
  /** `yard.standgeld_flag_minutes` of the site: the threshold of `standgeldVisits`. */
  standgeldMinutes: number;
  kpis: Kpis;
}

/** Half away from zero to one decimal (booking lifecycle, "KPIs", Format). */
export function round1(value: number): number {
  return (Math.sign(value) * Math.round(Math.abs(value) * 10 + Number.EPSILON)) / 10;
}

/** A rate in percent, or `null` without a denominator. */
export const percent = (part: number, whole: number) =>
  whole === 0 ? null : round1((part / whole) * 100);

/** A mean, or `null` over no values. */
export const mean = (sum: number, n: number) => (n === 0 ? null : round1(sum / n));

export const VisitItem = z.object({
  id: z.uuid(),
  code: z.string(),
  status: z.enum(BookingStatus),
  carrierName: z.string(),
  resourceName: z.string(),
  dockCode: z.string().nullable(),
  direction: z.string(),
  createdParty: z.enum(CreatedParty),
  walkIn: z.boolean(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  punctuality: z.enum(Punctuality).nullable(),
  punctualityMinutes: z.int().nullable(),
  checkedInAt: z.iso.datetime().nullable(),
  calledAt: z.iso.datetime().nullable(),
  atDockAt: z.iso.datetime().nullable(),
  loadingAt: z.iso.datetime().nullable(),
  doneAt: z.iso.datetime().nullable(),
  departedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  cancelledLate: z.boolean(),
  noShowAt: z.iso.datetime().nullable(),
  turnedAwayAt: z.iso.datetime().nullable(),
  waitMinutes: z.number().nullable(),
  dockDwellMinutes: z.number().nullable(),
  turnaroundMinutes: z.number().nullable(),
});
export type VisitItem = z.infer<typeof VisitItem>;

export interface VisitPage {
  site: { id: string; name: string; timeZone: string };
  items: VisitItem[];
  nextCursor: string | null;
}
