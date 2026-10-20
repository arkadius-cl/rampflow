import type { ValueOf } from '../../values/define.ts';

export const KpiUnit = {
  count: 'count',
  percent: 'percent',
  minutes: 'minutes',
} as const;
export type KpiUnit = ValueOf<typeof KpiUnit>;

/** The CSV exports of the reports screen (RP-01, RP-02). */
export const ReportExport = {
  kpis: 'kpis',
  visits: 'visits',
} as const;
export type ReportExport = ValueOf<typeof ReportExport>;
