import type {
  BoardResource,
  BoardView,
  BookingSummary,
} from '@rampflow/shared/modules/booking/api.staff';
import {
  BookingStatus,
  FinalBookingStatus,
  ResourceKind,
} from '@rampflow/shared/modules/booking/values';
import { BadgeSize, isValueOf } from '@rampflow/shared/values';
import { LayersIcon, SquareIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SiteTime } from '@/components/site-time';
import { BOOKING_STATUS, toneClasses } from '@/components/status-badge';
import { useSiteTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { BookingStatusBadge } from './display';

// BK-01: the day of one site, a column per bookable resource, time down the side. Built on the
// prototype's PlanBoard (components/plan-board) but positioned by instants from the board read
// model, so a DST day and server-side capacity per slot need no wall-clock arithmetic here.

const MINUTE = 60_000;
const isFinal = (b: BookingSummary) => isValueOf(FinalBookingStatus, b.status);

/** The rows the board shows: from the first open or booked slot to the last. */
export function visibleWindow(board: BoardView): { first: number; last: number } | null {
  const grid = board.resources[0]?.slots ?? [];
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  const slotOf = (instant: string) => {
    const t = Date.parse(instant);
    return grid.findLastIndex((s) => Date.parse(s.startsAt) <= t);
  };
  for (const r of board.resources) {
    r.slots.forEach((s, i) => {
      if (s.capacity > 0 || s.booked > 0) {
        first = Math.min(first, i);
        last = Math.max(last, i);
      }
    });
    for (const b of r.bookings) {
      first = Math.min(first, Math.max(0, slotOf(b.startsAt)));
      last = Math.max(last, slotOf(new Date(Date.parse(b.endsAt) - 1).toISOString()));
    }
  }
  return Number.isFinite(first) ? { first, last } : null;
}

/**
 * Every booking gets a lane, so no card covers another. Open bookings are placed first, so a
 * cancellation or no-show never moves a live card; final ones fill the free lanes after them.
 */
function lanesOf(bookings: BookingSummary[]) {
  const lanes: { start: number; end: number }[][] = [];
  const lane = new Map<string, number>();
  for (const b of [...bookings.filter((b) => !isFinal(b)), ...bookings.filter(isFinal)]) {
    const start = Date.parse(b.startsAt);
    const end = Date.parse(b.endsAt);
    let i = lanes.findIndex((l) => l.every((o) => o.end <= start || o.start >= end));
    if (i === -1) i = lanes.push([]) - 1;
    lanes[i]?.push({ start, end });
    lane.set(b.id, i);
  }
  return { lane, count: Math.max(1, lanes.length) };
}

export interface PlanBoardProps {
  board: BoardView;
  now: Date;
  selectedId?: string;
  onSelect: (bookingId: string) => void;
  /** Pixels per minute: 1.6 gives 48 px per 30-minute slot. */
  scale?: number;
}

export function PlanBoard({ board, now, selectedId, onSelect, scale = 1.6 }: PlanBoardProps) {
  const siteTime = useSiteTime();
  const scroller = useRef<HTMLDivElement>(null);
  const openedDay = useRef<string | null>(null);
  const window = visibleWindow(board);
  const grid = board.resources[0]?.slots ?? [];
  const rows = window ? grid.slice(window.first, window.last + 1) : [];
  const start = Date.parse(rows[0]?.startsAt ?? '');
  const end = Date.parse(rows.at(-1)?.startsAt ?? '') + board.gridMinutes * MINUTE;
  const y = (instant: number) => ((instant - start) / MINUTE) * scale;
  const nowAt = now.getTime();
  const showsNow = nowAt >= start && nowAt < end;
  const opening = board.resources
    .flatMap((r) => r.slots.filter((s) => s.capacity > 0).map((s) => Date.parse(s.startsAt)))
    .reduce((a, b) => Math.min(a, b), end);
  const day = `${board.siteId}:${board.date}`;
  // The day opens on the current time, a third down so some of the past stays in view, or on
  // the opening time. Refreshes of the same day leave the dispatcher's scroll position alone.
  useEffect(() => {
    const el = scroller.current;
    if (!el || openedDay.current === day) return;
    openedDay.current = day;
    el.scrollTop = showsNow ? y(nowAt) - el.clientHeight / 3 : y(opening);
  });
  if (!window || rows.length === 0) return null;
  const height = y(end);
  const zone = siteTime(new Date(start), board.timeZone).zone;

  return (
    <div
      ref={scroller}
      className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-background"
    >
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `4.5rem ${board.resources
            .map((r) =>
              r.kind === ResourceKind.pool ? 'minmax(18rem, 2fr)' : 'minmax(11rem, 1fr)',
            )
            .join(' ')}`,
        }}
      >
        <div className="sticky top-0 left-0 z-30 border-r border-b bg-background px-2 py-2 text-[11px] font-medium text-muted-foreground">
          {zone}
        </div>
        {board.resources.map((r) => (
          <ResourceHeader key={`h-${r.id}`} resource={r} />
        ))}

        <div className="sticky left-0 z-20 border-r bg-background" style={{ height }} aria-hidden>
          {rows.map((s, i) => (
            <div
              key={s.startsAt}
              className={cn(
                'absolute right-2 text-[11px] tabular-nums',
                i === 0 ? 'translate-y-0.5' : '-translate-y-1/2',
                s.wallTime.endsWith(':00')
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
              style={{ top: y(Date.parse(s.startsAt)) }}
            >
              {s.wallTime}
            </div>
          ))}
        </div>

        {board.resources.map((r) => (
          <ResourceColumn
            key={`c-${r.id}`}
            resource={r}
            rows={{ first: window.first, last: window.last }}
            gridMinutes={board.gridMinutes}
            timeZone={board.timeZone}
            y={y}
            height={height}
            scale={scale}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}

        {showsNow ? (
          <div
            className="pointer-events-none relative z-10"
            style={{ gridColumn: '1 / -1', gridRow: 2 }}
            data-testid="now-line"
          >
            <div className="absolute inset-x-0 flex items-center" style={{ top: y(nowAt) }}>
              <SiteTime
                {...siteTime(now, board.timeZone)}
                viewerTime={undefined}
                className="sticky left-0 ml-1 -translate-y-1/2 rounded-sm bg-signal px-1 text-[10px] font-semibold text-signal-foreground [&>span]:text-signal-foreground"
              />
              <div className="h-px flex-1 -translate-y-1/2 bg-signal" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResourceHeader({ resource }: { resource: BoardResource }) {
  const { t } = useTranslation('booking');
  const Icon = resource.kind === ResourceKind.pool ? LayersIcon : SquareIcon;
  const perSlot = Math.max(0, ...resource.slots.map((s) => s.capacity));
  return (
    <div className="sticky top-0 z-20 border-r border-b bg-background px-2 py-1.5 last:border-r-0">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="truncate">{resource.name}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {resource.kind === ResourceKind.pool
          ? t(($) => $.plan.board.pool, { n: perSlot })
          : t(($) => $.plan.board.single)}
        {resource.dailyCap === null
          ? null
          : ` · ${t(($) => $.plan.board.daily_cap, { n: resource.dailyCap })}`}
      </div>
    </div>
  );
}

function ResourceColumn({
  resource,
  rows,
  gridMinutes,
  timeZone,
  y,
  height,
  scale,
  selectedId,
  onSelect,
}: {
  resource: BoardResource;
  rows: { first: number; last: number };
  gridMinutes: number;
  timeZone: string;
  y: (instant: number) => number;
  height: number;
  scale: number;
  selectedId?: string;
  onSelect: (bookingId: string) => void;
}) {
  const { t } = useTranslation('booking');
  const slots = resource.slots.slice(rows.first, rows.last + 1);
  const { lane, count } = lanesOf(resource.bookings);
  const lanes = Math.max(count, ...slots.map((s) => s.capacity));
  // Pool cards leave a strip on the right, so the booked/capacity counters stay readable.
  const counterStrip = resource.kind === ResourceKind.pool ? '2.75rem' : '0px';
  return (
    <section
      className="relative border-r last:border-r-0"
      style={{ height }}
      aria-label={resource.name}
    >
      {slots.map((s) => {
        const over = s.booked > s.capacity;
        const full = s.capacity > 0 && s.booked === s.capacity;
        const closed = s.capacity === 0 && s.booked === 0;
        return (
          <div
            key={s.startsAt}
            data-slot-time={s.wallTime}
            data-over={over || undefined}
            className={cn(
              'absolute inset-x-0 border-b',
              s.wallTime.endsWith(':00') ? 'border-border' : 'border-border/50',
              closed && 'bg-muted/60',
              over && 'bg-tone-danger-bg/60',
            )}
            style={{ top: y(Date.parse(s.startsAt)), height: gridMinutes * scale }}
          >
            {resource.kind === ResourceKind.pool && !closed ? (
              <span
                className={cn(
                  'absolute right-1 bottom-0.5 rounded-sm px-1 text-[10px] tabular-nums',
                  over
                    ? 'bg-tone-danger text-white'
                    : full
                      ? 'font-medium text-tone-onsite'
                      : 'text-muted-foreground',
                )}
                title={t(($) => $.plan.board.slot_load, {
                  booked: s.booked,
                  capacity: s.capacity,
                })}
              >
                {s.booked}/{s.capacity}
              </span>
            ) : null}
          </div>
        );
      })}

      {resource.bookings.map((b) => {
        const left = (lane.get(b.id) ?? 0) / lanes;
        const top = y(Date.parse(b.startsAt));
        const h = y(Date.parse(b.endsAt)) - top;
        return (
          <BookingCard
            key={b.id}
            booking={b}
            timeZone={timeZone}
            selected={b.id === selectedId}
            dimmed={isFinal(b)}
            onSelect={onSelect}
            style={{
              top: top + 2,
              height: Math.max(h - 4, 18),
              left: `calc((100% - ${counterStrip}) * ${left} + 3px)`,
              width: `calc((100% - ${counterStrip}) / ${lanes} - 6px)`,
            }}
          />
        );
      })}
    </section>
  );
}

function BookingCard({
  booking,
  timeZone,
  selected,
  dimmed,
  onSelect,
  style,
}: {
  booking: BookingSummary;
  timeZone: string;
  selected: boolean;
  dimmed: boolean;
  onSelect: (bookingId: string) => void;
  style: React.CSSProperties & { height: number };
}) {
  const { t } = useTranslation('booking');
  const siteTime = useSiteTime();
  const tone =
    booking.status === BookingStatus.requested ? 'planned' : BOOKING_STATUS[booking.status].tone;
  const compact = style.height < 60;
  const slot = `${siteTime(booking.startsAt, timeZone).time}–${siteTime(booking.endsAt, timeZone).time}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(booking.id)}
      aria-pressed={selected}
      data-booking-code={booking.code}
      title={`${booking.carrierName} · ${slot}`}
      className={cn(
        'absolute flex flex-col gap-0.5 overflow-hidden rounded-md border border-l-4 px-1.5 py-1 text-left text-xs shadow-xs outline-none transition-shadow',
        'hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50',
        toneClasses[tone],
        'bg-background',
        booking.overCapacity && 'border-dashed border-tone-danger',
        dimmed && 'opacity-60',
        selected && 'z-10 ring-2 ring-primary',
      )}
      style={style}
    >
      <span className="flex items-center gap-1">
        <span className="truncate font-semibold text-foreground">{booking.carrierName}</span>
        {booking.overCapacity ? (
          <TriangleAlertIcon
            className="ml-auto size-3.5 shrink-0 text-tone-danger"
            aria-label={t(($) => $.lifecycle.flag.overCapacity)}
            role="img"
          />
        ) : null}
      </span>
      {compact ? (
        <span className="sr-only">
          {slot} <BookingStatusBadge status={booking.status} />
        </span>
      ) : (
        <>
          <span className="truncate text-[11px] text-muted-foreground">
            {t(($) => $.plan.board.units, { n: booking.loadUnits })} ·{' '}
            <span className="font-mono">{booking.code}</span>
          </span>
          <BookingStatusBadge status={booking.status} size={BadgeSize.sm} className="mt-auto" />
        </>
      )}
    </button>
  );
}
