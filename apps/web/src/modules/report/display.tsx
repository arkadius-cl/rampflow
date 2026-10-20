import { KPIS, type KpiReport } from '@rampflow/shared/modules/report/api';
import { KpiKey, KpiUnit } from '@rampflow/shared/modules/report/values';
import type { StaffLocale } from '@rampflow/shared/values';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/lib/i18n';

// The KPI tiles of RP-01. Values arrive rounded to one decimal; the tiles only localize them.

/** The formatting locale of each UI language, as the shared time module uses them. */
export const LOCALE_TAG: Record<StaffLocale, string> = { de: 'de', en: 'en-GB', pl: 'pl' };

/** "12,5 %", "44.2 min", "8"; `null` (an empty denominator) becomes "–". */
export function formatKpi(value: number | null, unit: KpiUnit, locale: StaffLocale): string {
  if (value === null) return '–';
  const digits = unit === KpiUnit.count ? 0 : 1;
  const n = new Intl.NumberFormat(LOCALE_TAG[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  if (unit === KpiUnit.percent) return `${n} %`;
  if (unit === KpiUnit.minutes) return `${n} min`;
  return n;
}

export function useFormatKpi() {
  const locale = useLocale();
  return (value: number | null, unit: KpiUnit) => formatKpi(value, unit, locale);
}

/** Early and late are shown inside the on-time tile, "reported apart" (RP-01). */
const TILES = KPIS.filter((k) => k.key !== KpiKey.earlyRate && k.key !== KpiKey.lateRate);
const unitOf = (key: KpiKey) => KPIS.find((k) => k.key === key)?.unit ?? KpiUnit.count;

export function KpiTiles({ report }: { report: KpiReport }) {
  const { t } = useTranslation('report');
  const format = useFormatKpi();
  const { kpis } = report;
  return (
    <section
      aria-label={t(($) => $.screen.kpis_label, {
        site: report.site.name,
        from: report.from,
        to: report.to,
      })}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
    >
      {TILES.map(({ key, unit }) => {
        const value = kpis[key];
        return (
          <Card key={key} size="sm" data-kpi={key}>
            <CardHeader>
              <CardDescription>{t(($) => $.kpi.name[key])}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {value === null ? (
                  <>
                    <span aria-hidden>–</span>
                    <span className="sr-only">{t(($) => $.screen.empty_value)}</span>
                  </>
                ) : (
                  format(value, unit)
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {key === KpiKey.onTimeRate ? (
                <p className="font-medium text-foreground">
                  {t(($) => $.kpi.early_late, {
                    early: format(kpis.earlyRate, unitOf(KpiKey.earlyRate)),
                    late: format(kpis.lateRate, unitOf(KpiKey.lateRate)),
                  })}
                </p>
              ) : null}
              <p>
                {key === KpiKey.standgeldVisits
                  ? t(($) => $.kpi.hint.standgeldVisits, { minutes: report.standgeldMinutes })
                  : t(($) => $.kpi.hint[key])}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
