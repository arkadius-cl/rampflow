import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Button } from "../core/Button.jsx";
import { StatusBadge } from "../status/StatusBadge.jsx";
import { PunctualityChip } from "../status/PunctualityChip.jsx";
/** Buchungskarte für das Gate (Pforte, Tablet quer): Kennzeichen groß, Ankunftszeit als „Anmeldung bis“, Pünktlichkeit, ein Primärknopf. Keine Rampenzeit. */
export function GateCard({ bookingId = "B-1042", plate = "WGM 4KX21", trailer, carrier, driver, bookingType, arrival = "13:45", status = "scheduled", punctuality = "on-time", deltaMin, primaryLabel = "Check-in", onPrimary, secondaryLabel = "Abweisen", onSecondary, selected = false, className = "" }) {
  return (
    <article aria-label={"Buchung " + bookingId} data-density="halle" className={"flex flex-col gap-4 rounded-lg border-2 bg-card text-card-foreground p-5 " + (selected ? "border-primary" : "border-border") + " " + className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-2xl font-semibold tracking-wide leading-none">{plate}</div>
          {trailer ? <div className="mt-1 font-mono text-md text-muted-foreground tracking-wide">{trailer}</div> : null}
        </div>
        <StatusBadge status={status} size="lg" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-md">
        <div><dt className="text-sm text-muted-foreground">Anmeldung an der Pforte bis</dt><dd className="font-semibold tabular-nums text-xl">{arrival} Uhr</dd></div>
        <div><dt className="text-sm text-muted-foreground">Pünktlichkeit</dt><dd className="mt-1"><PunctualityChip value={punctuality} deltaMin={deltaMin} size="lg" /></dd></div>
        <div><dt className="text-sm text-muted-foreground">Carrier</dt><dd className="truncate">{carrier || "–"}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Fahrer</dt><dd className="truncate">{driver || "–"}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Buchung</dt><dd className="font-mono">{bookingId}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Buchungsart</dt><dd className="truncate">{bookingType || "–"}</dd></div>
      </dl>
      <div className="mt-auto flex flex-wrap gap-3">
        <Button size="lg" icon="LogIn" onClick={onPrimary} className="flex-1 min-w-40">{primaryLabel}</Button>
        {secondaryLabel ? <Button size="lg" variant="outline" onClick={onSecondary}>{secondaryLabel}</Button> : null}
      </div>
    </article>
  );
}
