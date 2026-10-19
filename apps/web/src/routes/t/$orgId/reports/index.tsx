import { MAX_PERIOD_DAYS, ReportFilter, type VisitItem } from '@rampflow/shared/modules/report/api';
import { addDays, type LocalDate, siteDay, type TimeZone } from '@rampflow/shared/time';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ChartColumnIcon, DownloadIcon, MapPinIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { PageHeader } from '@/components/shells/office-shell';
import { SiteTime } from '@/components/site-time';
import { BookingStatusBadge, PUNCTUALITY, StatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { guard, tenantContextQuery, useAccess } from '@/lib/access';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { useSiteTime } from '@/lib/time';
import { capacityQueries } from '@/modules/capacity/queries';
import { KpiTiles, LOCALE_TAG, useFormatKpi } from '@/modules/report/display';
import { downloadCsv, kpiQuery, visitsQuery } from '@/modules/report/queries';

// RP-01 and RP-02: the KPIs of one site over site-local days, the visit list behind them and
// both CSV exports. The filters live in the URL; none of them is personal data.

const Search = z.object({
  site: z.string().optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  resource: z.string().optional().catch(undefined),
  carrier: z.string().optional().catch(undefined),
});
type Search = z.infer<typeof Search>;

export const Route = createFileRoute('/t/$orgId/reports/')({
  beforeLoad: guard({ permission: 'report.view' }),
  validateSearch: Search,
  component: ReportsPage,
});

const PRESETS = [
  { id: 'yesterday', from: -1, to: -1 },
  { id: 'last7', from: -6, to: 0 },
  { id: 'last30', from: -29, to: 0 },
] as const;

function ReportsPage() {
  const { t } = useTranslation('report');
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const sites = useQuery(tenantContextQuery(orgId)).data?.sites;
  const site = sites?.find((s) => s.id === search.site) ?? sites?.[0];

  if (!sites) return <Skeleton className="h-96 w-full" />;
  if (!site) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinIcon />
          </EmptyMedia>
          <EmptyTitle>{t(($) => $.screen.no_sites.title)}</EmptyTitle>
          <EmptyDescription>{t(($) => $.screen.no_sites.description)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const today = siteDay(new Date(), site.timeZone as TimeZone);
  const filter: ReportFilter = {
    siteId: site.id,
    from: (search.from ?? addDays(today, -6)) as LocalDate,
    to: (search.to ?? today) as LocalDate,
    ...(search.resource ? { resourceId: search.resource } : {}),
    ...(search.carrier ? { carrierId: search.carrier } : {}),
  };
  const set = (patch: Partial<Search>) =>
    void navigate({ search: (s: Search) => ({ ...s, ...patch }), replace: true });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.screen.title)}
        description={t(($) => $.screen.description)}
        actions={<ExportButtons orgId={orgId} filter={filter} />}
      />
      <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          id="report-site"
          label={t(($) => $.screen.filters.site)}
          value={site.id}
          onChange={(id) => set({ site: id, resource: undefined })}
          choices={sites.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Field>
          <FieldLabel htmlFor="report-from">{t(($) => $.screen.filters.from)}</FieldLabel>
          <Input
            id="report-from"
            type="date"
            value={filter.from}
            onChange={(e) => e.target.value && set({ from: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="report-to">{t(($) => $.screen.filters.to)}</FieldLabel>
          <Input
            id="report-to"
            type="date"
            value={filter.to}
            onChange={(e) => e.target.value && set({ to: e.target.value })}
          />
        </Field>
        <ResourceFilter
          orgId={orgId}
          siteId={site.id}
          value={search.resource ?? ''}
          onChange={(resource) => set({ resource: resource || undefined })}
        />
        <CarrierFilter
          orgId={orgId}
          value={search.carrier ?? ''}
          onChange={(carrier) => set({ carrier: carrier || undefined })}
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          {PRESETS.map((p) => {
            const from = addDays(today, p.from);
            const to = addDays(today, p.to);
            const active = filter.from === from && filter.to === to;
            return (
              <Button
                key={p.id}
                size="sm"
                variant={active ? 'secondary' : 'ghost'}
                aria-pressed={active}
                onClick={() => set({ from, to })}
              >
                {t(($) => $.screen.filters.presets[p.id])}
              </Button>
            );
          })}
        </div>
      </div>
      {ReportFilter.safeParse(filter).success ? (
        <Report orgId={orgId} filter={filter} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            {t(($) => $.screen.invalid_period, { days: MAX_PERIOD_DAYS })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ExportButtons({ orgId, filter }: { orgId: string; filter: ReportFilter }) {
  const { t } = useTranslation('report');
  const { has } = useAccess();
  const valid = ReportFilter.safeParse(filter).success;
  const kpis = useMutation({ mutationFn: () => downloadCsv(orgId, 'kpis', filter) });
  const visits = useMutation({ mutationFn: () => downloadCsv(orgId, 'visits', filter) });
  // Without report.export the buttons are absent: an operator cannot change the package.
  if (!has('report.export')) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!valid || kpis.isPending}
        onClick={() => kpis.mutate()}
      >
        {kpis.isPending ? <Spinner /> : <DownloadIcon />}
        {t(($) => $.screen.export_kpis)}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!valid || visits.isPending}
        onClick={() => visits.mutate()}
      >
        {visits.isPending ? <Spinner /> : <DownloadIcon />}
        {t(($) => $.screen.export_visits)}
      </Button>
    </>
  );
}

function ResourceFilter(props: {
  orgId: string;
  siteId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation('report');
  const resources = useQuery(capacityQueries.resources(props.orgId, props.siteId)).data?.items;
  return (
    <FilterSelect
      id="report-resource"
      label={t(($) => $.screen.filters.resource)}
      any={t(($) => $.screen.filters.all_resources)}
      value={props.value}
      onChange={props.onChange}
      choices={(resources ?? []).map((r) => ({ value: r.id, label: r.name }))}
    />
  );
}

function CarrierFilter(props: { orgId: string; value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation('report');
  const carriers = useQuery({
    queryKey: ['tenant', props.orgId, 'report', 'carriers'],
    queryFn: () =>
      call(
        api.t[':orgId'].bookings['carrier-options'].$get({
          param: { orgId: props.orgId },
          query: {},
        }),
      ),
  }).data?.items;
  return (
    <FilterSelect
      id="report-carrier"
      label={t(($) => $.screen.filters.carrier)}
      any={t(($) => $.screen.filters.all_carriers)}
      value={props.value}
      onChange={props.onChange}
      choices={(carriers ?? []).map((c) => ({ value: c.id, label: c.name }))}
    />
  );
}

function FilterSelect({
  id,
  label,
  any,
  value,
  choices,
  onChange,
}: {
  id: string;
  label: string;
  /** The "all" choice; without it a value is required. */
  any?: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        className="w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {any === undefined ? null : <NativeSelectOption value="">{any}</NativeSelectOption>}
        {choices.map((c) => (
          <NativeSelectOption key={c.value} value={c.value}>
            {c.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function Report({ orgId, filter }: { orgId: string; filter: ReportFilter }) {
  const { t } = useTranslation('report');
  const report = useQuery(kpiQuery(orgId, filter));
  const visits = useInfiniteQuery(visitsQuery(orgId, filter));
  const items = visits.data?.pages.flatMap((p) => p.items) ?? [];
  const timeZone = report.data?.site.timeZone ?? visits.data?.pages[0]?.site.timeZone;

  return (
    <>
      {report.data ? <KpiTiles report={report.data} /> : <Skeleton className="h-48 w-full" />}
      <h2 className="mt-2 text-base font-semibold">{t(($) => $.screen.visits.title)}</h2>
      {visits.isPending || !timeZone ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartColumnIcon />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.screen.visits.empty.title)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.screen.visits.empty.description)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t(($) => $.screen.visits.columns.start)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.code)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.carrier)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.resource)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.status)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.punctuality)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.checked_in)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.at_dock)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.done)}</TableHead>
                <TableHead>{t(($) => $.screen.visits.columns.departed)}</TableHead>
                <TableHead className="text-right">
                  {t(($) => $.screen.visits.columns.wait)}
                </TableHead>
                <TableHead className="text-right">
                  {t(($) => $.screen.visits.columns.dwell)}
                </TableHead>
                <TableHead className="pr-4 text-right">
                  {t(($) => $.screen.visits.columns.turnaround)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((v) => (
                <VisitRow key={v.id} visit={v} timeZone={timeZone} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {visits.hasNextPage ? (
        <Button
          variant="outline"
          className="w-fit self-center"
          disabled={visits.isFetchingNextPage}
          onClick={() => void visits.fetchNextPage()}
        >
          {visits.isFetchingNextPage ? <Spinner /> : null}
          {t(($) => $.screen.visits.more)}
        </Button>
      ) : null}
    </>
  );
}

function VisitRow({ visit: v, timeZone }: { visit: VisitItem; timeZone: string }) {
  const { t } = useTranslation(['report', 'booking']);
  const siteTime = useSiteTime();
  const format = useFormatKpi();
  const locale = useLocale();
  const at = (iso: string | null) =>
    iso ? <SiteTime {...siteTime(iso, timeZone)} /> : <span aria-hidden>–</span>;
  const date = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    timeZone,
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(v.startsAt));
  return (
    <TableRow>
      <TableCell className="pl-4 whitespace-nowrap">
        <span className="mr-1 text-muted-foreground tabular-nums">{date}</span>
        <SiteTime {...siteTime(v.startsAt, timeZone)} />
      </TableCell>
      <TableCell className="font-mono text-xs">{v.code}</TableCell>
      <TableCell>{v.carrierName}</TableCell>
      <TableCell>{v.resourceName}</TableCell>
      <TableCell>
        {v.status === 'requested' ? null : (
          <BookingStatusBadge
            status={v.status}
            size="sm"
            label={t(($) => $.lifecycle.status[v.status], { ns: 'booking' })}
          />
        )}
      </TableCell>
      <TableCell>
        {v.punctuality ? (
          <StatusBadge
            meta={PUNCTUALITY[v.punctuality]}
            size="sm"
            label={t(($) => $.lifecycle.punctuality[v.punctuality ?? 'on_time'], {
              ns: 'booking',
            })}
          />
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap">{at(v.checkedInAt)}</TableCell>
      <TableCell className="whitespace-nowrap">{at(v.atDockAt)}</TableCell>
      <TableCell className="whitespace-nowrap">{at(v.doneAt)}</TableCell>
      <TableCell className="whitespace-nowrap">{at(v.departedAt)}</TableCell>
      <TableCell className="text-right tabular-nums">{format(v.waitMinutes, 'minutes')}</TableCell>
      <TableCell className="text-right tabular-nums">
        {format(v.dockDwellMinutes, 'minutes')}
      </TableCell>
      <TableCell className="pr-4 text-right tabular-nums">
        {format(v.turnaroundMinutes, 'minutes')}
      </TableCell>
    </TableRow>
  );
}
