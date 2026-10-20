import { BookingStatus, PlanView } from '@rampflow/shared/modules/booking/values';
import {
  addDays,
  type LocalDate,
  localDateSchema,
  siteDay,
  type TimeZone,
} from '@rampflow/shared/time';
import { BadgeSize, isValueOf, Permission } from '@rampflow/shared/values';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  CalendarIcon,
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns3Icon,
  ListIcon,
  PlusIcon,
  TruckIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { de, enGB, pl } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Calendar } from '@/components/ui/calendar';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { guard, tenantContextQuery, useAccess } from '@/lib/access';
import { useLocale } from '@/lib/i18n';
import { BookingList } from '@/modules/booking/booking-list';
import { BookingSheet } from '@/modules/booking/booking-sheet';
import { DetailPanel } from '@/modules/booking/detail-panel';
import { BookingStatusBadge, useDayLabel } from '@/modules/booking/display';
import { PlanBoard, visibleWindow } from '@/modules/booking/plan-board';
import { boardQuery, bookingListQuery } from '@/modules/booking/queries';

// BK-01, BK-02, BK-03: the dispatcher's day per site (ADR-0011 route map). The site, day, view,
// selected booking and the staff booking sheet live in the URL, so a reload or a shared link
// shows the same board.

const PlanSearch = z.object({
  site: z.uuid().optional().catch(undefined),
  date: localDateSchema.optional().catch(undefined),
  view: z.enum(PlanView).optional().catch(undefined),
  booking: z.uuid().optional().catch(undefined),
  new: z.literal(1).optional().catch(undefined),
});
export type PlanSearch = z.infer<typeof PlanSearch>;

export const Route = createFileRoute('/t/$orgId/plan/')({
  validateSearch: (search) => PlanSearch.parse(search),
  beforeLoad: guard({ permission: Permission.booking.view }),
  component: PlanPage,
});

const PICKER_LOCALE = { de, en: enGB, pl } as const;

/** The current instant, refreshed every 30 seconds for the now line and "Today". */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function PlanPage() {
  const { t } = useTranslation('booking');
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const access = useAccess();
  const sites = useQuery(tenantContextQuery(orgId)).data?.sites ?? [];
  const site = sites.find((s) => s.id === search.site) ?? sites[0];
  const now = useNow();

  if (!site) {
    return (
      <Empty className="min-h-[60svh]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarRangeIcon />
          </EmptyMedia>
          <EmptyTitle>{t(($) => $.plan.empty.no_sites_title)}</EmptyTitle>
          <EmptyDescription>{t(($) => $.plan.empty.no_sites)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const zone = site.timeZone as TimeZone;
  const today = siteDay(now, zone);
  const date = search.date ?? today;
  const view = search.view ?? PlanView.board;
  const set = (patch: Partial<PlanSearch>, replace = false) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace });

  return (
    // Exactly the viewport below the shell's 3rem header, so the board scrolls inside itself
    // and its sticky resource header and time column stay in view.
    <div className="-m-4 flex h-[calc(100svh-3rem)] min-h-0 flex-col lg:-m-6">
      <h1 className="sr-only">{t(($) => $.plan.title)}</h1>
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <NativeSelect
          aria-label={t(($) => $.plan.toolbar.site)}
          size="sm"
          className="w-44"
          value={site.id}
          onChange={(e) => set({ site: e.target.value, booking: undefined })}
        >
          {sites.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <DayNav date={date} today={today} onChange={(d) => set({ date: d, booking: undefined })} />
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
        <ToggleGroup
          value={[view]}
          onValueChange={(v) => {
            const next = v[0];
            if (isValueOf(PlanView, next)) set({ view: next });
          }}
          variant="outline"
          size="sm"
          aria-label={t(($) => $.plan.toolbar.view)}
        >
          <ToggleGroupItem value="board">
            <Columns3Icon />
            {t(($) => $.plan.toolbar.board)}
          </ToggleGroupItem>
          <ToggleGroupItem value="list">
            <ListIcon />
            {t(($) => $.plan.toolbar.list)}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto flex items-center gap-2">
          <Legend />
          {access.can(Permission.booking.walk_in) && access.can(Permission.yard.gate) ? (
            <a
              href={`/t/${orgId}/gate?site=${site.id}&walkin=1`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <TruckIcon />
              {t(($) => $.plan.toolbar.walk_in)}
            </a>
          ) : null}
          {access.can(Permission.booking.staff_book) ? (
            <Button size="sm" onClick={() => set({ new: 1 })}>
              <PlusIcon />
              {t(($) => $.plan.toolbar.new)}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {view === PlanView.board ? (
            <BoardView
              orgId={orgId}
              siteId={site.id}
              date={date}
              now={now}
              selectedId={search.booking}
              onSelect={(id) => set({ booking: id })}
            />
          ) : (
            <ListView
              orgId={orgId}
              siteId={site.id}
              siteName={site.name}
              date={date}
              selectedId={search.booking}
              onSelect={(id) => set({ booking: id })}
            />
          )}
        </div>
        {search.booking ? (
          <SelectedPanel
            orgId={orgId}
            siteId={site.id}
            date={date}
            bookingId={search.booking}
            onClose={() => set({ booking: undefined })}
          />
        ) : null}
      </div>

      {access.can(Permission.booking.staff_book) ? (
        <BookingSheet
          orgId={orgId}
          siteId={site.id}
          timeZone={site.timeZone}
          date={date}
          open={search.new === 1}
          onOpenChange={(open) => set({ new: open ? 1 : undefined })}
          onCreated={(b) =>
            set({ new: undefined, booking: b.id, date: siteDay(new Date(b.startsAt), zone) })
          }
        />
      ) : null}
    </div>
  );
}

function DayNav({
  date,
  today,
  onChange,
}: {
  date: LocalDate;
  today: LocalDate;
  onChange: (date: LocalDate) => void;
}) {
  const { t } = useTranslation('booking');
  const locale = useLocale();
  const dayLabel = useDayLabel();
  const [open, setOpen] = useState(false);
  const [y, m, d] = date.split('-').map(Number);
  const selected = new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1);
  return (
    <>
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          aria-label={t(($) => $.plan.toolbar.previous_day)}
          onClick={() => onChange(addDays(date, -1))}
        >
          <ChevronLeftIcon />
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<Button variant="outline" size="sm" className="min-w-40 tabular-nums" />}
            aria-label={t(($) => $.plan.toolbar.choose_day, { day: dayLabel(date) })}
          >
            <CalendarIcon />
            <span data-testid="plan-day">{dayLabel(date)}</span>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={PICKER_LOCALE[locale]}
              selected={selected}
              defaultMonth={selected}
              onSelect={(day) => {
                if (!day) return;
                const pad = (n: number) => String(n).padStart(2, '0');
                onChange(
                  `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}` as LocalDate,
                );
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="sm"
          aria-label={t(($) => $.plan.toolbar.next_day)}
          onClick={() => onChange(addDays(date, 1))}
        >
          <ChevronRightIcon />
        </Button>
      </ButtonGroup>
      <Button variant="ghost" size="sm" disabled={date === today} onClick={() => onChange(today)}>
        {t(($) => $.plan.toolbar.today)}
      </Button>
    </>
  );
}

function Legend() {
  const { t } = useTranslation('booking');
  const shown = [
    BookingStatus.confirmed,
    BookingStatus.checked_in,
    BookingStatus.called,
    BookingStatus.loading,
    BookingStatus.done,
  ];
  return (
    <ul className="hidden items-center gap-1 2xl:flex" aria-label={t(($) => $.plan.toolbar.legend)}>
      {shown.map((s) => (
        <li key={s}>
          <BookingStatusBadge status={s} size={BadgeSize.sm} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Announces a refreshed board to screen readers when a poll brings changed data, not on the first
 * load (UX concept, BK-01). Query results keep their identity while nothing changed.
 */
function useUpdateAnnouncement(data: unknown) {
  const { t } = useTranslation('booking');
  const previous = useRef(data);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (previous.current !== undefined && data !== previous.current) {
      setMessage(t(($) => $.plan.board.updated));
    }
    previous.current = data;
  }, [data, t]);
  return message;
}

function BoardView({
  orgId,
  siteId,
  date,
  now,
  selectedId,
  onSelect,
}: {
  orgId: string;
  siteId: string;
  date: LocalDate;
  now: Date;
  selectedId?: string;
  onSelect: (bookingId: string) => void;
}) {
  const { t } = useTranslation('booking');
  const board = useQuery(boardQuery(orgId, siteId, date));
  const announcement = useUpdateAnnouncement(board.data);

  if (board.isPending) {
    return <Skeleton className="min-h-96 flex-1" />;
  }
  if (board.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t(($) => $.plan.board.error)}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void board.refetch()}>
            {t(($) => $.plan.actions.retry)}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  const data = board.data;
  const bookings = data.resources.reduce((n, r) => n + r.bookings.length, 0);
  const window = visibleWindow(data);
  return (
    <>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {data.resources.length === 0 || !window ? (
        <Empty className="flex-1 border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarRangeIcon />
            </EmptyMedia>
            <EmptyTitle>
              {data.resources.length === 0
                ? t(($) => $.plan.empty.no_resources_title)
                : t(($) => $.plan.empty.closed_title)}
            </EmptyTitle>
            <EmptyDescription>
              {data.resources.length === 0
                ? t(($) => $.plan.empty.no_resources)
                : t(($) => $.plan.empty.closed)}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent />
        </Empty>
      ) : (
        <>
          {bookings === 0 ? (
            <p className="text-sm text-muted-foreground">{t(($) => $.plan.empty.no_bookings)}</p>
          ) : null}
          <PlanBoard board={data} now={now} selectedId={selectedId} onSelect={onSelect} />
        </>
      )}
    </>
  );
}

function ListView({
  orgId,
  siteId,
  siteName,
  date,
  selectedId,
  onSelect,
}: {
  orgId: string;
  siteId: string;
  siteName: string;
  date: LocalDate;
  selectedId?: string;
  onSelect: (bookingId: string) => void;
}) {
  const { t } = useTranslation('booking');
  const dayLabel = useDayLabel();
  const list = useInfiniteQuery(bookingListQuery(orgId, siteId, date));
  const board = useQuery(boardQuery(orgId, siteId, date));
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  if (list.isPending) return <Skeleton className="min-h-64 flex-1" />;
  if (items.length === 0) {
    return (
      <Empty className="flex-1 border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListIcon />
          </EmptyMedia>
          <EmptyTitle>{t(($) => $.plan.empty.no_bookings)}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <BookingList
      items={items}
      board={board.data}
      caption={t(($) => $.plan.list.caption, { site: siteName, day: dayLabel(date) })}
      selectedId={selectedId}
      onSelect={onSelect}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onMore={() => void list.fetchNextPage()}
    />
  );
}

function SelectedPanel({
  orgId,
  siteId,
  date,
  bookingId,
  onClose,
}: {
  orgId: string;
  siteId: string;
  date: LocalDate;
  bookingId: string;
  onClose: () => void;
}) {
  const board = useQuery(boardQuery(orgId, siteId, date));
  const summary = board.data?.resources.flatMap((r) => r.bookings).find((b) => b.id === bookingId);
  return (
    <DetailPanel
      key={bookingId}
      orgId={orgId}
      bookingId={bookingId}
      overCapacity={summary?.overCapacity ?? false}
      onClose={onClose}
    />
  );
}
