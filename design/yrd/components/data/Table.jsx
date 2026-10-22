import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Data Table der Disposition: dichte Zeilen (36 px), Tabellenziffern, sortierbare Spalten, Zeile anklickbar. columns: [{key,label,align,width,render,sortable,mono}]. */
export function Table({ columns = [], rows = [], rowKey = "id", onRowClick, sort, onSort, selectedKey, dense = true, empty = "Keine Einträge.", caption, className = "" }) {
  return (
    <div className={"w-full overflow-auto rounded-md border border-border bg-card " + className}>
      <table className="w-full border-collapse text-base">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border bg-muted/60 text-muted-foreground">
            {columns.map((c) => { const active = sort && sort.key === c.key; return (
              <th key={c.key} scope="col" style={{ width: c.width }} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={"h-9 px-3 text-sm font-medium whitespace-nowrap " + (c.align === "right" ? "text-right" : "text-left")}>
                {c.sortable ? <button type="button" onClick={() => onSort && onSort({ key: c.key, dir: active && sort.dir === "asc" ? "desc" : "asc" })} className={"inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring " + (active ? "text-foreground" : "")}>{c.label}<Icon name={active ? (sort.dir === "asc" ? "ArrowUp" : "ArrowDown") : "ArrowUpDown"} size={12} /></button> : c.label}
              </th>); })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-muted-foreground">{empty}</td></tr> : null}
          {rows.map((r) => { const k = r[rowKey]; const sel = k === selectedKey; return (
            <tr key={k} onClick={onRowClick ? () => onRowClick(r) : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(r) : undefined} aria-selected={sel || undefined}
              className={"border-b border-border last:border-0 outline-none " + (onRowClick ? "cursor-pointer hover:bg-muted/60 focus-visible:bg-muted " : "") + (sel ? "bg-accent/60" : "")}>
              {columns.map((c) => <td key={c.key} className={(dense ? "h-9 py-1" : "h-12 py-2") + " px-3 align-middle whitespace-nowrap tabular-nums " + (c.align === "right" ? "text-right" : "") + (c.mono ? " font-mono" : "")}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>); })}
        </tbody>
      </table>
    </div>
  );
}
