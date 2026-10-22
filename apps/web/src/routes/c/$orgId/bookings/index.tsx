import type { PortalBookingSummary } from '@rampflow/shared/modules/booking/api.portal';
import {
  BookingPeriod,
  BookingStatus,
  BookingWizardStep,
  CarrierBookingsTab,
  RegistrationStatus,
} from '@rampflow/shared/modules/booking/values';
import { type LocalDate, localDateSchema } from '@rampflow/shared/time';
import { isValueOf, Permission, SortOrder, UiSize, values } from '@rampflow/shared/values';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CalendarXIcon, FilterXIcon, HourglassIcon, PlusIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/office-shell';
import { SiteTime } from '@/components/site-time';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { carrierContextQuery, guard, useAccess } from '@/lib/access';
import { useSiteTime } from '@/lib/time';
import { BookingStatusBadge, useLoadTypeName } from '@/modules/booking/display';
import { linkedTenantsQuery } from '@/modules/carriers/queries';
import { beforeCutoff, SlotText } from '@/modules/portal/booking-parts';
import { type BookingFilters, portalBookingsQuery } from '@/modules/portal/queries';

// CR-05: /c/$orgId/bookings, the carrier's bookings at every linked warehouse, each in its
// site's zone, with the visit from gate-in to gate-out. Filters live in the URL. A registration
// waiting for approval shows as an alert (CR-02).

interface Search {
  tab: CarrierBookingsTab;
  tenant?: string;
  site?: string;
  status?: BookingStatus;
  from?: LocalDate;
  to?: LocalDate;
}

const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

export const Route = createFileRoute('/c/$orgId/bookings/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: isValueOf(CarrierBookingsTab, s.tab) ? s.tab : CarrierBookingsTab.upcoming,
    tenant: text(s.tenant),
    site: text(s.site),
    status: isValueOf(BookingStatus, s.status) ? s.status : undefined,
    from: localDateSchema.safeParse(s.from).data,
    to: localDateSchema.safeParse(s.to).data,
  }),
  beforeLoad: guard({ permission: Permission.booking.view }),
  component: BookingsPage,
});

/** The viewer's own calendar day; each booking's dates are read in its site's zone. */
const todayHere = () => new Date().toLocaleDateString('sv-SE') as LocalDate;

function filtersOf(s: Search): BookingFilters {
  const today = todayHere();
  const base = { tenantId: s.tenant, siteId: s.site, status: s.status };
  const range: Pick<BookingFilters, 'from' | 'to' | 'when' | 'order'> =
    s.tab === CarrierBookingsTab.today
      ? { from: today, to: today, order: SortOrder.asc }
      : s.tab === CarrierBookingsTab.past
        ? { when: BookingPeriod.past, order: SortOrder.desc }
        : { when: BookingPeriod.upcoming, order: SortOrder.asc };
  return { ...base, ...range, ...(s.from ? { from: s.from } : {}), ...(s.to ? { to: s.to } : {}) };
}

function BookingsPage() {
  const { t } = useTranslation('booking');
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const access = useAccess();
  const id = useId();
  const set = (patch: Partial<Search>) =>
    void navigate({ search: (s: Search) => ({ ...s, ...patch }), replace: true });
  const list = useInfiniteQuery(portalBookingsQuery(orgId, filtersOf(search)));
  const tenants = useQuery(carrierContextQuery(orgId)).data?.tenants ?? [];
  const linked = useQuery(linkedTenantsQuery(orgId));
  const pending = (linked.data?.items ?? []).filter(
    (x) => !x.link && x.registration?.status === RegistrationStatus.pending_approval,
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const sites = [...new Map(items.map((b) => [b.site.id, b.site.name])).entries()];
  const filtered = search.tenant || search.site || search.status || search.from || search.to;
  const canBook = access.can(Permission.booking.book);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.portal.list.title)}
        description={t(($) => $.portal.list.description)}
        actions={
          canBook ? (
            <Link
              to="/c/$orgId/book"
              params={{ orgId }}
              search={{ step: BookingWizardStep.where }}
              className={buttonVariants()}
            >
              <PlusIcon /> {t(($) => $.portal.list.new)}
            </Link>
          ) : null
        }
      />
      {pending.map((x) => (
        <Alert key={x.tenantId}>
          <HourglassIcon />
          <AlertTitle>{t(($) => $.portal.list.pending_title, { name: x.name })}</AlertTitle>
          <AlertDescription>{t(($) => $.portal.list.pending)}</AlertDescription>
        </Alert>
      ))}

      <div className="flex flex-wrap items-end gap-2">
        <Tabs value={search.tab} onValueChange={(v) => set({ tab: v as CarrierBookingsTab })}>
          <TabsList aria-label={t(($) => $.portal.list.range)}>
            {values(CarrierBookingsTab).map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(($) => $.portal.list.tabs[tab])}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Field className="w-48">
          <FieldLabel htmlFor={`${id}-tenant`} className="sr-only">
            {t(($) => $.portal.list.tenant)}
          </FieldLabel>
          <NativeSelect
            id={`${id}-tenant`}
            className="w-full"
            value={search.tenant ?? ''}
            onChange={(e) => set({ tenant: e.target.value || undefined, site: undefined })}
          >
            <NativeSelectOption value="">{t(($) => $.portal.list.all_tenants)}</NativeSelectOption>
            {tenants.map((x) => (
              <NativeSelectOption key={x.id} value={x.id}>
                {x.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor={`${id}-site`} className="sr-only">
            {t(($) => $.portal.list.site)}
          </FieldLabel>
          <NativeSelect
            id={`${id}-site`}
            className="w-full"
            value={search.site ?? ''}
            onChange={(e) => set({ site: e.target.value || undefined })}
          >
            <NativeSelectOption value="">{t(($) => $.portal.list.all_sites)}</NativeSelectOption>
            {sites.map(([siteId, name]) => (
              <NativeSelectOption key={siteId} value={siteId}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor={`${id}-status`} className="sr-only">
            {t(($) => $.portal.list.status)}
          </FieldLabel>
          <NativeSelect
            id={`${id}-status`}
            className="w-full"
            value={search.status ?? ''}
            onChange={(e) => set({ status: (e.target.value || undefined) as BookingStatus })}
          >
            <NativeSelectOption value="">{t(($) => $.portal.list.any_status)}</NativeSelectOption>
            {values(BookingStatus)
              .filter((s) => s !== BookingStatus.requested)
              .map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {t(($) => $.lifecycle.status[s])}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor={`${id}-from`} className="text-xs">
            {t(($) => $.portal.list.from)}
          </FieldLabel>
          <Input
            id={`${id}-from`}
            type="date"
            value={search.from ?? ''}
            onChange={(e) => set({ from: localDateSchema.safeParse(e.target.value).data })}
          />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor={`${id}-to`} className="text-xs">
            {t(($) => $.portal.list.to)}
          </FieldLabel>
          <Input
            id={`${id}-to`}
            type="date"
            value={search.to ?? ''}
            onChange={(e) => set({ to: localDateSchema.safeParse(e.target.value).data })}
          />
        </Field>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() =>
              set({
                tenant: undefined,
                site: undefined,
                status: undefined,
                from: undefined,
                to: undefined,
              })
            }
          >
            <FilterXIcon /> {t(($) => $.portal.list.clear)}
          </Button>
        ) : null}
      </div>

      {list.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarXIcon />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.portal.list.empty_title)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.portal.list.empty)}</EmptyDescription>
          </EmptyHeader>
          {canBook ? (
            <EmptyContent>
              <Link
                to="/c/$orgId/book"
                params={{ orgId }}
                search={{ step: BookingWizardStep.where }}
                className={buttonVariants({ variant: 'outline' })}
              >
                <PlusIcon /> {t(($) => $.portal.list.new)}
              </Link>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <div className="overflow-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.portal.list.col.slot)}</TableHead>
                <TableHead>{t(($) => $.portal.list.col.where)}</TableHead>
                <TableHead>{t(($) => $.portal.list.col.code)}</TableHead>
                <TableHead>{t(($) => $.portal.list.col.load)}</TableHead>
                <TableHead>{t(($) => $.portal.list.col.status)}</TableHead>
                <TableHead>{t(($) => $.portal.list.col.visit)}</TableHead>
                <TableHead className="text-right">{t(($) => $.portal.list.col.actions)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((b) => (
                <Row key={b.id} orgId={orgId} booking={b} canBook={canBook} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {list.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t(($) => $.portal.list.more)}
        </Button>
      ) : null}
    </div>
  );
}

function Row({
  orgId,
  booking: b,
  canBook,
}: {
  orgId: string;
  booking: PortalBookingSummary;
  canBook: boolean;
}) {
  const { t } = useTranslation('booking');
  const loadTypeName = useLoadTypeName();
  const siteTime = useSiteTime();
  const visit = (at: string | null) =>
    at ? (
      <SiteTime {...siteTime(at, b.timeZone)} />
    ) : (
      <span className="text-muted-foreground">–</span>
    );
  const changeable = canBook && beforeCutoff(b);
  return (
    <TableRow>
      <TableCell>
        <SlotText startsAt={b.startsAt} endsAt={b.endsAt} timeZone={b.timeZone} />
      </TableCell>
      <TableCell>
        <div className="font-medium">{b.tenant.name}</div>
        <div className="text-muted-foreground">{b.site.name}</div>
      </TableCell>
      <TableCell className="font-mono text-xs">{b.code}</TableCell>
      <TableCell>
        {b.loadUnits} · {loadTypeName(b.loadType.name)}
        {b.plate || b.reference ? (
          <div className="font-mono text-xs text-muted-foreground">
            {[b.plate, b.reference].filter(Boolean).join(' · ')}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <BookingStatusBadge status={b.status} size={UiSize.sm} />
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        <span className="sr-only">{t(($) => $.portal.list.gate_in)} </span>
        {visit(b.checkedInAt)}
        <span aria-hidden className="mx-1 text-muted-foreground">
          →
        </span>
        <span className="sr-only">, {t(($) => $.portal.list.gate_out)} </span>
        {visit(b.departedAt)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Link
            to="/c/$orgId/bookings/$bookingId"
            params={{ orgId, bookingId: b.id }}
            className={buttonVariants({ variant: changeable ? 'outline' : 'ghost', size: 'xs' })}
            aria-label={`${changeable ? t(($) => $.portal.list.change) : t(($) => $.portal.list.details)} ${b.code}`}
          >
            {changeable ? t(($) => $.portal.list.change) : t(($) => $.portal.list.details)}
          </Link>
        </div>
      </TableCell>
    </TableRow>
  );
}
