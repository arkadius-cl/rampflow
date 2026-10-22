import React from "react";
/** Input OTP – Code an der Pforte (z. B. 6 Ziffern aus der SMS). Große Felder in der Halle, Ziffern tabellarisch, Mono. */
export function InputOTP({ length = 6, value = "", onChange, invalid = false, size = "default", className = "" }) {
  const refs = React.useRef([]);
  const chars = Array.from({ length }, (_, i) => value[i] || "");
  const set = (i, c) => { const next = chars.slice(); next[i] = c; onChange && onChange(next.join("").slice(0, length)); if (c && refs.current[i + 1]) refs.current[i + 1].focus(); };
  const box = size === "lg" ? "h-control-primary w-14 text-2xl" : "h-control w-10 text-lg";
  return (
    <div className={"inline-flex items-center gap-2 " + className} role="group" aria-label="Code">
      {chars.map((c, i) => (
        <React.Fragment key={i}>
          {i === Math.ceil(length / 2) && length > 4 ? <span aria-hidden="true" className="w-2 h-0.5 bg-border rounded-full"></span> : null}
          <input ref={(el) => (refs.current[i] = el)} inputMode="numeric" pattern="[0-9]*" maxLength={1} value={c} aria-label={"Ziffer " + (i + 1)} aria-invalid={invalid || undefined}
            onChange={(e) => set(i, e.target.value.replace(/\D/g, "").slice(-1))}
            onKeyDown={(e) => { if (e.key === "Backspace" && !c && refs.current[i - 1]) refs.current[i - 1].focus(); }}
            className={"rounded-control border bg-background text-center font-mono font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " + box + " " + (invalid ? "border-destructive" : "border-input")} />
        </React.Fragment>
      ))}
    </div>
  );
}
