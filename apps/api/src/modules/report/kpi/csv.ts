import { TZDate } from '@date-fns/tz';
import { KPIS, type KpiReport, type VisitItem } from '@rampflow/shared/modules/report/api';
import { KpiUnit, VisitCsvColumn } from '@rampflow/shared/modules/report/values';
import { type StaffLocale, values } from '@rampflow/shared/values';
import { formatISO } from 'date-fns';
import type { TFunction } from 'i18next';

// RP-02 (API conventions, "Time and formats"): UTF-8 with BOM, `;` for de and pl and `,` for
// en, the header in the user's language, instants in ISO 8601 with the site's offset. Decimals
// use the separator a spreadsheet of that language expects.

export const CSV_DELIMITER: Record<StaffLocale, string> = { de: ';', en: ',', pl: ';' };
const DECIMAL: Record<StaffLocale, string> = { de: ',', en: '.', pl: ',' };

const NEGATIVE_NUMBER = /^-\d+([.,]\d+)?$/;

/** Quotes when needed, and defuses cells a spreadsheet would run as a formula. */
function cell(value: string, delimiter: string): string {
  const formula = /^[=+\-@\t\r]/.test(value) && !NEGATIVE_NUMBER.test(value);
  const safe = formula ? `'${value}` : value;
  return safe.includes(delimiter) || /["\r\n]/.test(safe)
    ? `"${safe.replaceAll('"', '""')}"`
    : safe;
}

function document(rows: readonly (readonly string[])[], locale: StaffLocale): string {
  const delimiter = CSV_DELIMITER[locale];
  const lines = rows.map((r) => r.map((v) => cell(v, delimiter)).join(delimiter));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Counts as integers, rates and minutes with their one decimal, in the user's notation. */
const number = (value: number | null, locale: StaffLocale, unit: KpiUnit = KpiUnit.minutes) =>
  value === null ? '' : value.toFixed(unit === KpiUnit.count ? 0 : 1).replace('.', DECIMAL[locale]);

const siteTime = (iso: string | null, timeZone: string) =>
  iso ? formatISO(new TZDate(new Date(iso), timeZone)) : '';

/** The KPI table: one row per KPI with the site and period it covers. */
export function kpiCsv(report: KpiReport, locale: StaffLocale, t: TFunction): string {
  const header = ['site', 'from', 'to', 'kpi', 'value', 'unit'].map((c) =>
    t(`report:kpi.csv.${c}`),
  );
  const rows = KPIS.map(({ key, unit }) => [
    report.site.name,
    report.from,
    report.to,
    t(`report:kpi.name.${key}`),
    number(report.kpis[key], locale, unit),
    t(`report:kpi.unit.${unit}`),
  ]);
  return document([header, ...rows], locale);
}

const VISIT_COLUMNS = values(VisitCsvColumn);

/** The visit list with every timestamp in the site's offset. */
export function visitsCsv(
  items: readonly VisitItem[],
  timeZone: string,
  locale: StaffLocale,
  t: TFunction,
): string {
  const yesNo = (v: boolean) => t(v ? 'report:visits.csv.yes' : 'report:visits.csv.no');
  const header = VISIT_COLUMNS.map((c) => t(`report:visits.csv.${c}`));
  const rows = items.map((v) => {
    const cells: Record<VisitCsvColumn, string> = {
      code: v.code,
      status: t(`booking:lifecycle.status.${v.status}`),
      carrier: v.carrierName,
      resource: v.resourceName,
      dock: v.dockCode ?? '',
      direction: t(`report:visits.direction.${v.direction}`),
      createdParty: t(`report:visits.party.${v.createdParty}`),
      walkIn: yesNo(v.walkIn),
      startsAt: siteTime(v.startsAt, timeZone),
      endsAt: siteTime(v.endsAt, timeZone),
      punctuality: v.punctuality ? t(`booking:lifecycle.punctuality.${v.punctuality}`) : '',
      punctualityMinutes: number(v.punctualityMinutes, locale, KpiUnit.count),
      checkedInAt: siteTime(v.checkedInAt, timeZone),
      calledAt: siteTime(v.calledAt, timeZone),
      atDockAt: siteTime(v.atDockAt, timeZone),
      loadingAt: siteTime(v.loadingAt, timeZone),
      doneAt: siteTime(v.doneAt, timeZone),
      departedAt: siteTime(v.departedAt, timeZone),
      cancelledAt: siteTime(v.cancelledAt, timeZone),
      cancelledLate: yesNo(v.cancelledLate),
      noShowAt: siteTime(v.noShowAt, timeZone),
      turnedAwayAt: siteTime(v.turnedAwayAt, timeZone),
      waitMinutes: number(v.waitMinutes, locale),
      dockDwellMinutes: number(v.dockDwellMinutes, locale),
      turnaroundMinutes: number(v.turnaroundMinutes, locale),
    };
    return VISIT_COLUMNS.map((c) => cells[c]);
  });
  return document([header, ...rows], locale);
}
