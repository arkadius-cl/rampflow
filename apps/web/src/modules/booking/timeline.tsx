import type { BookingEventView } from '@rampflow/shared/modules/booking/api.staff';
import type { BookingEventType } from '@rampflow/shared/modules/booking/events';
import { siteDay, type TimeZone } from '@rampflow/shared/time';
import {
  BanIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  DoorOpenIcon,
  FilePenIcon,
  LinkIcon,
  LogInIcon,
  LogOutIcon,
  type LucideIcon,
  OctagonXIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  Undo2Icon,
  UserXIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SiteTime } from '@/components/site-time';
import { Skeleton } from '@/components/ui/skeleton';
import { useSiteTime } from '@/lib/time';
import { useDayLabel } from './display';

// YD-08 and BK-03: the event log of a booking, oldest first. Actors show only when the API
// sends them (`booking.view_actors`, the works council rule).

const EVENT_ICON: Record<BookingEventType, LucideIcon> = {
  created: CalendarCheckIcon,
  rescheduled: CalendarClockIcon,
  avis_updated: FilePenIcon,
  cancelled: BanIcon,
  driver_link_regenerated: RefreshCwIcon,
  driver_link_sent: SendIcon,
  no_show: UserXIcon,
  checked_in: LogInIcon,
  turned_away: OctagonXIcon,
  called: BellRingIcon,
  reassigned: LinkIcon,
  uncalled: Undo2Icon,
  at_dock: DoorOpenIcon,
  loading_started: PackageOpenIcon,
  done: CircleCheckIcon,
  departed: LogOutIcon,
  safety_linked: ShieldCheckIcon,
};

export function BookingTimeline({
  events,
  timeZone,
}: {
  events: BookingEventView[] | undefined;
  timeZone: string;
}) {
  const { t } = useTranslation('booking');
  const siteTime = useSiteTime();
  const dayLabel = useDayLabel();
  if (!events) return <Skeleton className="h-24 w-full" />;
  return (
    <ol className="flex flex-col gap-3" aria-label={t(($) => $.plan.detail.timeline)}>
      {events.map((e) => {
        const Icon = EVENT_ICON[e.type];
        const note = noteOf(e);
        return (
          <li key={e.id} className="flex items-start gap-2 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 leading-tight">
              <div className="font-medium">{t(($) => $.lifecycle.event[e.type])}</div>
              <div className="text-xs text-muted-foreground">
                {dayLabel(siteDay(new Date(e.at), timeZone as TimeZone))}{' '}
                <SiteTime {...siteTime(e.at, timeZone)} />
                {e.actor ? (
                  <>
                    {' · '}
                    {e.actor.name ?? t(($) => $.lifecycle.party[e.actor?.party ?? 'system'])}
                  </>
                ) : null}
              </div>
              {note.kind === 'reason' ? (
                <div className="mt-0.5 text-xs">
                  {t(($) => $.plan.detail.reason, { reason: note.text })}
                </div>
              ) : null}
              {note.kind === 'moved' ? (
                <div className="mt-0.5 text-xs">
                  {t(($) => $.plan.detail.moved_from)}{' '}
                  <SiteTime {...siteTime(note.from, timeZone)} />
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type Note = { kind: 'none' } | { kind: 'reason'; text: string } | { kind: 'moved'; from: string };

function noteOf(e: BookingEventView): Note {
  const data = e.data as Record<string, unknown>;
  if (e.type === 'rescheduled') {
    const from = data.from as { startsAt: string } | undefined;
    const reason = data.forceReason;
    if (typeof reason === 'string') return { kind: 'reason', text: reason };
    return from ? { kind: 'moved', from: from.startsAt } : { kind: 'none' };
  }
  const reason = e.type === 'created' ? data.forceReason : data.reason;
  if (typeof reason === 'string' && e.type !== 'turned_away')
    return { kind: 'reason', text: reason };
  return { kind: 'none' };
}
