import React from "react";
import { Icon } from "../core/Icon.jsx";
const T = {
  de: { called: "Sie werden aufgerufen", goTo: "Bitte fahren Sie zu", dock: "Rampe", wait: "Bitte warten", waitHint: "Sie werden hier aufgerufen.", gate: "Anmeldung an der Pforte bis", hall: "Halle", ok: "Verstanden", help: "Hilfe" },
  pl: { called: "Zostali Państwo wezwani", goTo: "Proszę podjechać do", dock: "Rampa", wait: "Proszę czekać", waitHint: "Wezwanie pojawi się tutaj.", gate: "Zgłoszenie na bramie do", hall: "Hala", ok: "Rozumiem", help: "Pomoc" },
};
/** Aufruf-Vollbild der Fahrer-App: ein Thema, riesige Rampennummer, Icon + kurzer Text, keine Fachbegriffe. lang: de | pl. mode="waiting" vor dem Aufruf. */
export function CallScreen({ lang = "de", mode = "called", dock = "8", hall = "Halle 2", plate = "WGM 4KX21", arrival = "13:45", onAck, onHelp, className = "" }) {
  const t = T[lang] || T.de;
  const called = mode === "called";
  return (
    <div data-density="fahrer" className={"flex min-h-[640px] w-full max-w-[360px] flex-col bg-background text-foreground " + className}>
      <div className={"flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center " + (called ? "bg-status-called text-status-called-foreground" : "bg-status-on-yard text-status-on-yard-foreground")}>
        <Icon name={called ? "Megaphone" : "Clock"} size={48} />
        <div className="text-xl font-semibold leading-tight">{called ? t.called : t.wait}</div>
        {called ? (
          <>
            <div className="text-md opacity-90">{t.goTo}</div>
            <div className="text-md font-medium">{t.dock}</div>
            <div className="text-[112px] font-semibold leading-none tabular-nums tracking-tight">{dock}</div>
            <div className="text-md opacity-90">{hall}</div>
          </>
        ) : (
          <>
            <div className="text-md opacity-90">{t.waitHint}</div>
            <div className="mt-4 text-sm opacity-80">{t.gate}</div>
            <div className="text-2xl font-semibold tabular-nums">{arrival}</div>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground"><span className="font-mono">{plate}</span><span>yrd</span></div>
      <div className="flex gap-3 p-4">
        {called ? <button type="button" onClick={onAck} className="flex h-control-primary flex-1 items-center justify-center gap-2 rounded-control bg-primary text-md font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><Icon name="Check" size={24} />{t.ok}</button> : null}
        <button type="button" onClick={onHelp} className={"flex h-control-primary items-center justify-center gap-2 rounded-control border border-border bg-background px-5 text-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " + (called ? "" : "flex-1")}><Icon name="Phone" size={22} />{t.help}</button>
      </div>
    </div>
  );
}
