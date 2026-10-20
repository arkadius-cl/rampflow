import { LoadStatus, ResourceKind } from '@rampflow/shared/modules/booking/values';
import { LayersIcon, SquareIcon, TriangleAlertIcon } from 'lucide-react';
import { BOOKING_STATUS, BookingStatusBadge, toneClasses } from '@/components/status-badge';
import type { BookableResource, Booking, BookingStatus } from '@/lib/domain';
import { cn } from '@/lib/utils';

const COUNTED: ReadonlySet<BookingStatus> = new Set([
  LoadStatus.confirmed,
  LoadStatus.checked_in,
  LoadStatus.called,
  LoadStatus.at_dock,
  LoadStatus.loading,
  LoadStatus.done,
]);

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export interface PlanBoardProps {
  resources: BookableResource[];
  bookings: Booking[];
  zone: string;
  dayStart: string;
  dayEnd: string;
  gridMinutes: number;
  /** Site-local wall clock, draws the now line. */
  now?: string;
  selectedId?: string;
  onSelect?: (booking: Booking) => void;
  /** Pixels per minute. 1.6 gives 48 px per 30 min slot. */
  scale?: number;
}

interface Lane {
  end: number;
}

function layout(bookings: Booking[]) {
  const lanes: Lane[] = [];
  const placed = new Map<string, number>();
  for (const b of [...bookings].sort((a, z) => toMinutes(a.start) - toMinutes(z.start))) {
    const start = toMinutes(b.start);
    let lane = lanes.findIndex((l) => l.end <= start);
    if (lane === -1) {
      lanes.push({ end: toMinutes(b.end) });
      lane = lanes.length - 1;
    } else {
      lanes[lane] = { end: toMinutes(b.end) };
    }
    placed.set(b.id, lane);
  }
  return { placed, laneCount: Math.max(1, lanes.length) };
}

/**
 * Day view: one column per bookable resource, time on the vertical axis.
 * Pool columns show booked-against-capacity per grid slot; bookings sit in
 * lanes so parallel slots stay readable. Custom because no shadcn component
 * lays out time-positioned cards in capacity lanes.
 */
export function PlanBoard({
  resources,
  bookings,
  zone,
  dayStart,
  dayEnd,
  gridMinutes,
  now,
  selectedId,
  onSelect,
  scale = 1.6,
}: PlanBoardProps) {
  const start = toMinutes(dayStart);
  const end = toMinutes(dayEnd);
  const slots = Array.from(
    { length: (end - start) / gridMinutes },
    (_, i) => start + i * gridMinutes,
  );
  const height = (end - start) * scale;
  const nowY = now ? (toMinutes(now) - start) * scale : undefined;

  return (
    <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `4.5rem ${resources
            .map((r) =>
              r.kind === ResourceKind.pool ? 'minmax(18rem, 2fr)' : 'minmax(11rem, 1fr)',
            )
            .join(' ')}`,
        }}
      >
        <div className="sticky top-0 left-0 z-30 border-r border-b bg-background px-2 py-2 text-[11px] font-medium text-muted-foreground">
          {zone}
        </div>
        {resources.map((r) => (
          <ResourceHeader key={`h-${r.id}`} resource={r} />
        ))}

        <div className="sticky left-0 z-20 border-r bg-background" style={{ height }} aria-hidden>
          {slots.map((min) => (
            <div
              key={min}
              className={cn(
                'absolute right-2 text-[11px] tabular-nums',
                min === start ? 'translate-y-0.5' : '-translate-y-1/2',
                min % 60 === 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
              style={{ top: (min - start) * scale }}
            >
              {fromMinutes(min)}
            </div>
          ))}
        </div>

        {resources.map((r) => {
          const own = bookings.filter((b) => b.resourceId === r.id);
          const { placed, laneCount } = layout(own.filter((b) => COUNTED.has(b.status)));
          const finals = own.filter((b) => !COUNTED.has(b.status));
          const lanes = Math.max(laneCount, r.capacity);
          return (
            <section
              key={`c-${r.id}`}
              className="relative border-r last:border-r-0"
              style={{ height }}
              aria-label={r.name}
            >
              {slots.map((min) => {
                const booked = own.filter(
                  (b) =>
                    COUNTED.has(b.status) &&
                    toMinutes(b.start) < min + gridMinutes &&
                    toMinutes(b.end) > min,
                ).length;
                const over = booked > r.capacity;
                const full = booked === r.capacity;
                return (
                  <div
                    key={min}
                    className={cn(
                      'absolute inset-x-0 border-b',
                      min % 60 === 0 ? 'border-border' : 'border-border/50',
                      over && 'bg-tone-danger-bg/60',
                    )}
                    style={{ top: (min - start) * scale, height: gridMinutes * scale }}
                  >
                    {r.kind === ResourceKind.pool ? (
                      <span
                        className={cn(
                          'absolute right-1 bottom-0.5 rounded-sm px-1 text-[10px] tabular-nums',
                          over
                            ? 'bg-tone-danger text-white'
                            : full
                              ? 'text-tone-onsite'
                              : 'text-muted-foreground/70',
                        )}
                      >
                        {booked}/{r.capacity}
                      </span>
                    ) : null}
                  </div>
                );
              })}

              {own.map((b) => {
                const lane = placed.get(b.id);
                const isFinal = lane === undefined;
                const top = (toMinutes(b.start) - start) * scale;
                const h = (toMinutes(b.end) - toMinutes(b.start)) * scale;
                const width = isFinal ? 100 : 100 / lanes;
                const left = isFinal ? 0 : (lane / lanes) * 100;
                return (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    selected={b.id === selectedId}
                    onSelect={onSelect}
                    style={{
                      top: top + 2,
                      height: h - 4,
                      left: `calc(${left}% + 3px)`,
                      width: `calc(${width}% - 6px)`,
                    }}
                    dimmed={isFinal && finals.length > 0}
                  />
                );
              })}
            </section>
          );
        })}

        {nowY !== undefined ? (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
            style={{ top: nowY + 41 }}
          >
            <span className="sr-only">
              Now {now} {zone}
            </span>
            <span className="sticky left-0 ml-1 rounded-sm bg-signal px-1 text-[10px] font-semibold text-signal-foreground tabular-nums">
              {now}
            </span>
            <div className="h-px flex-1 bg-signal" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResourceHeader({ resource }: { resource: BookableResource }) {
  const Icon = resource.kind === ResourceKind.pool ? LayersIcon : SquareIcon;
  return (
    <div className="sticky top-0 z-20 border-r border-b bg-background px-2 py-1.5 last:border-r-0">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="truncate">{resource.name}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {resource.kind === ResourceKind.pool
          ? `Pool · ${resource.capacity} per slot · ${resource.dockIds.length} docks`
          : 'Single dock'}
        {resource.dailyCap ? ` · cap ${resource.dailyCap}/day` : ''}
      </div>
    </div>
  );
}

function BookingCard({
  booking,
  selected,
  onSelect,
  style,
  dimmed,
}: {
  booking: Booking;
  selected: boolean;
  onSelect?: (b: Booking) => void;
  style: React.CSSProperties;
  dimmed: boolean;
}) {
  const meta = BOOKING_STATUS[booking.status];
  const compact = typeof style.height === 'number' && style.height < 60;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(booking)}
      aria-pressed={selected}
      className={cn(
        'absolute flex flex-col gap-0.5 overflow-hidden rounded-md border border-l-4 px-1.5 py-1 text-left text-xs shadow-xs outline-none transition-shadow',
        'hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50',
        toneClasses[meta.tone],
        'bg-background',
        booking.overCapacity && 'border-dashed border-tone-danger',
        dimmed && 'opacity-60',
        selected && 'ring-2 ring-primary',
      )}
      style={style}
    >
      <div className="flex items-center gap-1">
        <span className="truncate font-semibold text-foreground">{booking.carrier}</span>
        {booking.overCapacity ? (
          <TriangleAlertIcon className="ml-auto size-3.5 shrink-0 text-tone-danger" />
        ) : null}
      </div>
      {compact ? null : (
        <>
          <div className="truncate text-[11px] text-muted-foreground">
            {booking.loadUnits} {booking.loadUnits === 1 ? 'unit' : 'units'} ·{' '}
            {booking.plate ?? 'no plate'}
          </div>
          <BookingStatusBadge status={booking.status} size="sm" className="mt-auto" />
        </>
      )}
    </button>
  );
}
