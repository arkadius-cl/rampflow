import type { AvisView } from '@rampflow/shared/modules/avis/avis';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/lib/i18n';

// The stored avis, read-only, on the booking page (AV-01). Empty values show a dash.

export function AvisSummary({
  avis,
  direction,
}: {
  avis: AvisView | null;
  direction: 'inbound' | 'outbound';
}) {
  const { t } = useTranslation('booking');
  const { t: tAvis } = useTranslation('avis');
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const language = new Intl.DisplayNames([locale], { type: 'language' });
  if (!avis) return <p className="text-sm text-muted-foreground">{t(($) => $.plan.avis.none)}</p>;
  const dash = '–';
  const vehicleType = avis.vehicle.type;
  const yesNo = (v: boolean | null) =>
    v === null ? dash : v ? t(($) => $.plan.avis.yes) : t(($) => $.plan.avis.no);
  const rows: [string, React.ReactNode][] = [
    [
      tAvis(($) => $.avis.field.references),
      avis.references.map((r) => (
        <span key={`${r.type}-${r.value}`} className="block">
          <span className="text-muted-foreground">
            {tAvis(($) => $.avis.referenceType[r.type])}:
          </span>{' '}
          {r.value}
        </span>
      )),
    ],
    [
      direction === 'inbound'
        ? tAvis(($) => $.avis.field.counterpartyInbound)
        : tAvis(($) => $.avis.field.counterpartyOutbound),
      avis.counterpartyName,
    ],
    [
      tAvis(($) => $.avis.field.loadUnits),
      avis.loadUnits
        .map(
          (u) =>
            `${number.format(u.quantity)} × ${u.label ?? tAvis(($) => $.avis.loadUnitType[u.type])}`,
        )
        .join(', '),
    ],
    [
      tAvis(($) => $.avis.field.grossWeightKg),
      avis.grossWeightKg === null ? dash : number.format(avis.grossWeightKg),
    ],
    [
      tAvis(($) => $.avis.field.palletPositions),
      avis.palletPositions === null ? dash : number.format(avis.palletPositions),
    ],
    [tAvis(($) => $.avis.field.palletExchange), yesNo(avis.palletExchange)],
    [
      tAvis(($) => $.avis.field.vehicleType),
      vehicleType ? tAvis(($) => $.avis.vehicleType[vehicleType]) : dash,
    ],
    [
      tAvis(($) => $.avis.field.plate),
      <span key="plate" className="font-mono">
        {[avis.vehicle.plateCountry, avis.vehicle.plate].filter(Boolean).join(' ') || dash}
      </span>,
    ],
    [
      tAvis(($) => $.avis.field.trailerPlate),
      <span key="trailer" className="font-mono">
        {avis.vehicle.trailerPlate ?? dash}
      </span>,
    ],
    [tAvis(($) => $.avis.field.driverName), avis.driver.name ?? dash],
    [tAvis(($) => $.avis.field.driverPhone), avis.driver.phone ?? dash],
    [
      tAvis(($) => $.avis.field.driverLocale),
      avis.driver.locale ? (language.of(avis.driver.locale) ?? avis.driver.locale) : dash,
    ],
    [
      tAvis(($) => $.avis.field.dangerousGoods),
      avis.dangerousGoods.present
        ? avis.dangerousGoods.items.map((i) => (
            <span key={`${i.unNumber}-${i.adrClass}`} className="block font-mono">
              {i.unNumber} · {i.adrClass}
              {i.packingGroup ? ` · ${i.packingGroup}` : ''}
            </span>
          ))
        : t(($) => $.plan.avis.no),
    ],
    [
      tAvis(($) => $.avis.field.temperature),
      avis.temperature.controlled
        ? [avis.temperature.minC, avis.temperature.maxC]
            .map((c) => (c === undefined ? dash : `${number.format(c)} °C`))
            .join(' – ')
        : t(($) => $.plan.avis.no),
    ],
    [tAvis(($) => $.avis.field.notes), avis.notes ?? dash],
  ];
  if (avis.plateSeen) {
    rows.push([
      tAvis(($) => $.avis.field.plateSeen),
      <span key="seen" className="font-mono">
        {avis.plateSeen}
      </span>,
    ]);
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
