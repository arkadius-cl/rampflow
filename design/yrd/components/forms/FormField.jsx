import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Formularfeld: Label, Steuerelement, Hinweis, Fehler. Fehler = Icon + Text in Rot, Rahmen rot, aria-describedby. */
export function FormField({ id, label, hint, error, required = false, children, className = "" }) {
  const fid = id || React.useId();
  return (
    <div className={"flex flex-col gap-1.5 " + className}>
      {label ? <label htmlFor={fid} className="text-sm font-medium text-foreground">{label}{required ? <span aria-hidden="true" className="text-destructive"> *</span> : null}</label> : null}
      {React.isValidElement(children) ? React.cloneElement(children, { id: fid, invalid: !!error || children.props.invalid, "aria-describedby": error ? fid + "-err" : hint ? fid + "-hint" : undefined }) : children}
      {error ? <p id={fid + "-err"} role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><Icon name="AlertCircle" size={14} />{error}</p> : hint ? <p id={fid + "-hint"} className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
