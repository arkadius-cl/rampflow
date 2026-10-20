import type { ValueOf } from '../../values/define.ts';

export const KpiUnit = {
  count: 'count',
  percent: 'percent',
  minutes: 'minutes',
} as const;
export type KpiUnit = ValueOf<typeof KpiUnit>;

/** The columns of the visit CSV export, in file order; `report:visits.csv.<column>` heads each. */
export const VisitCsvColumn = {
  code: 'code',
  status: 'status',
  carrier: 'carrier',
  resource: 'resource',
  dock: 'dock',
  direction: 'direction',
  createdParty: 'createdParty',
  walkIn: 'walkIn',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  punctuality: 'punctuality',
  punctualityMinutes: 'punctualityMinutes',
  checkedInAt: 'checkedInAt',
  calledAt: 'calledAt',
  atDockAt: 'atDockAt',
  loadingAt: 'loadingAt',
  doneAt: 'doneAt',
  departedAt: 'departedAt',
  cancelledAt: 'cancelledAt',
  cancelledLate: 'cancelledLate',
  noShowAt: 'noShowAt',
  turnedAwayAt: 'turnedAwayAt',
  waitMinutes: 'waitMinutes',
  dockDwellMinutes: 'dockDwellMinutes',
  turnaroundMinutes: 'turnaroundMinutes',
} as const;
export type VisitCsvColumn = ValueOf<typeof VisitCsvColumn>;
/** The CSV exports of the reports screen (RP-01, RP-02). */
export const ReportExport = {
  kpis: 'kpis',
  visits: 'visits',
} as const;
export type ReportExport = ValueOf<typeof ReportExport>;
