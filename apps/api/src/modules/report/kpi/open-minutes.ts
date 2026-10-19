/** `[start, end)`. */
export interface Interval {
  start: Date;
  end: Date;
}

const MINUTE = 60_000;

/** Sorted, overlapping or touching intervals merged into one. */
function union(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out.at(-1);
    if (last && i.start <= last.end) {
      if (i.end > last.end) last.end = i.end;
    } else {
      out.push({ start: i.start, end: i.end });
    }
  }
  return out;
}

/**
 * Minutes inside `open` and outside `closed` (the denominator of dock utilisation, RP-01).
 * Works on instants, so a DST day counts its real 23 or 25 hours.
 */
export function openMinutes(open: readonly Interval[], closed: readonly Interval[]): number {
  const shut = union(closed);
  let ms = 0;
  for (const o of union(open)) {
    ms += o.end.getTime() - o.start.getTime();
    for (const c of shut) {
      const overlap =
        Math.min(o.end.getTime(), c.end.getTime()) - Math.max(o.start.getTime(), c.start.getTime());
      if (overlap > 0) ms -= overlap;
    }
  }
  return ms / MINUTE;
}
