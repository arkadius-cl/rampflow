import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Wallboard (TV 55", Hofseite): Kennzeichen → Rampe, aufgerufene zuerst, pulsierend neu. Lesbar aus 8 m. rows: [{plate, dock, state:"called"|"at-dock"|"waiting", since}]. */
export function Wallboard({ title = "Frischelager Hollerbach · Augsburg", clock = "14:02", updated = "vor 5 s", rows = [], offline = false, className = "" }) {
  const st = { called: { label: "Bitte zur Rampe", icon: "Megaphone", cls: "bg-status-called text-status-called-foreground" }, "at-dock": { label: "An Rampe", icon: "Forklift", cls: "bg-status-at-dock text-status-at-dock-foreground" }, waiting: { label: "Bitte warten", icon: "Clock", cls: "bg-status-on-yard text-status-on-yard-foreground" } };
  return (
    <div data-density="halle" className={"flex h-full w-full flex-col bg-background text-foreground " + className}>
      {offline ? <div role="alert" className="flex h-14 items-center justify-center gap-3 bg-foreground text-background text-lg font-medium"><Icon name="WifiOff" size={24} />Offline · letzte Aktualisierung {clock}</div> : null}
      <header className="flex items-center justify-between px-8 py-5 border-b border-border">
        <span className="text-xl font-semibold truncate min-w-0">{title}</span>
        <span className="flex shrink-0 items-center gap-6 text-md text-muted-foreground whitespace-nowrap"><span>aktualisiert {updated}</span><span className="text-2xl font-semibold tabular-nums text-foreground">{clock}</span></span>
      </header>
      <div className="grid flex-1 grid-cols-[1fr_auto_auto] gap-x-8 gap-y-3 p-8 content-start">
        <div className="text-md font-medium text-muted-foreground">Kennzeichen</div><div className="text-md font-medium text-muted-foreground">Status</div><div className="text-md font-medium text-muted-foreground text-right">Rampe</div>
        {rows.map((r, i) => { const s = st[r.state] || st.waiting; return (
          <React.Fragment key={r.plate + i}>
            <div className="flex h-20 items-center rounded-lg bg-card border border-border px-6 font-mono text-2xl font-semibold tracking-wider whitespace-nowrap">{r.plate}</div>
            <div className={"flex h-20 items-center gap-3 rounded-lg px-6 text-lg font-medium whitespace-nowrap " + s.cls + (r.state === "called" ? " animate-pulse" : "")}><Icon name={s.icon} size={28} />{s.label}</div>
            <div className={"flex h-20 min-w-32 items-center justify-end rounded-lg px-6 text-2xl font-semibold tabular-nums " + (r.dock ? "bg-card border border-border" : "text-muted-foreground")}>{r.dock || "–"}</div>
          </React.Fragment>); })}
      </div>
    </div>
  );
}
