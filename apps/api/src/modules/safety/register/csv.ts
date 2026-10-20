import { TZDate } from '@date-fns/tz';
import type { RegisterItem } from '@rampflow/shared/modules/safety/api.register';
import { AcknowledgementCsvColumn } from '@rampflow/shared/modules/safety/values';
import { type StaffLocale, values } from '@rampflow/shared/values';
import { formatISO } from 'date-fns';
import type { TFunction } from 'i18next';

// CSV of the register (SF-03, API conventions "Time and formats"): UTF-8 with BOM, the user's
// delimiter, header from the user's locale, instants with the site's offset.

export const CSV_DELIMITER: Record<StaffLocale, string> = { de: ';', en: ',', pl: ';' };

const COLUMNS = values(AcknowledgementCsvColumn);

/** Quotes when needed, and defuses cells a spreadsheet would run as a formula. */
function cell(value: string, delimiter: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return safe.includes(delimiter) || /["\r\n]/.test(safe)
    ? `"${safe.replaceAll('"', '""')}"`
    : safe;
}

const siteTime = (iso: string | null, timeZone: string) =>
  iso ? formatISO(new TZDate(new Date(iso), timeZone)) : '';

export function registerCsv(items: readonly RegisterItem[], locale: StaffLocale, t: TFunction) {
  const delimiter = CSV_DELIMITER[locale];
  const line = (row: readonly string[]) => row.map((v) => cell(v, delimiter)).join(delimiter);
  const rows = items.map((item) => {
    const zone = item.site?.timeZone ?? 'UTC';
    const cells: Record<AcknowledgementCsvColumn, string> = {
      completedAt: siteTime(item.completedAt, zone),
      expiresAt: siteTime(item.expiresAt, zone),
      status: t(`safety:register.status.${item.status}`),
      driverName: item.driverName,
      carrier: item.booking?.carrierName ?? '',
      booking: item.booking?.code ?? '',
      site: item.site?.name ?? '',
      instruction: item.instruction.name,
      version: String(item.version.version),
      locale: item.locale,
      score: item.score === null ? '' : String(item.score),
      attempts: String(item.attempts),
      channel: t(`safety:register.channel.${item.channel}`),
    };
    return line(COLUMNS.map((c) => cells[c]));
  });
  const header = line(COLUMNS.map((c) => t(`safety:register.csv.${c}`)));
  return `﻿${[header, ...rows].join('\r\n')}\r\n`;
}
