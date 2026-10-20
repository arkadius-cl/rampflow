import type { RegisterFilter, RegisterItem } from '@rampflow/shared/modules/safety/api.register';
import { AckStatus } from '@rampflow/shared/modules/safety/values';
import { BadgeSize, Permission, values } from '@rampflow/shared/values';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ClipboardCheckIcon, DownloadIcon, SearchIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/office-shell';
import { SiteTime } from '@/components/site-time';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
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
import { guard, tenantContextQuery } from '@/lib/access';
import { useSiteTime } from '@/lib/time';
import { AckStatusBadge, useDate, useLanguageName } from '@/modules/safety/display';
import {
  downloadRegisterCsv,
  registerFilterOptionsQuery,
  registerQuery,
} from '@/modules/safety/queries';

// SF-03: who confirmed which briefing version, filtered by site, carrier, driver name, version
// and status, with the CSV export of the same filters. The filters stay out of the URL, because
// the driver name is a personal search term (API routes, "Requests").

export const Route = createFileRoute('/t/$orgId/safety/acknowledgements')({
  beforeLoad: guard({ permission: Permission.safety.view_register }),
  component: RegisterPage,
});

interface Filters {
  siteId: string;
  carrierId: string;
  driverName: string;
  instructionId: string;
  versionId: string;
  status: string;
}

const NO_FILTERS: Filters = {
  siteId: '',
  carrierId: '',
  driverName: '',
  instructionId: '',
  versionId: '',
  status: '',
};

/** The API filter: empty choices left out. */
function toFilter(f: Filters): RegisterFilter {
  const driverName = f.driverName.trim();
  return {
    ...(f.siteId ? { siteId: f.siteId } : {}),
    ...(f.carrierId ? { carrierId: f.carrierId } : {}),
    ...(driverName ? { driverName } : {}),
    ...(f.instructionId ? { instructionId: f.instructionId } : {}),
    ...(f.versionId ? { versionId: f.versionId } : {}),
    ...(f.status ? { status: f.status as RegisterFilter['status'] } : {}),
  };
}

function RegisterPage() {
  const { t } = useTranslation('safety');
  const { orgId } = Route.useParams();
  const sites = useQuery(tenantContextQuery(orgId)).data?.sites ?? [];
  const options = useQuery(registerFilterOptionsQuery(orgId)).data;
  const [filters, setFilters] = useState(NO_FILTERS);
  const filter = toFilter(useDeferredValue(filters));
  const register = useInfiniteQuery(registerQuery(orgId, filter));
  const exportCsv = useMutation({ mutationFn: () => downloadRegisterCsv(orgId, filter) });
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const versions = options?.instructions.find((i) => i.id === filters.instructionId)?.versions;
  const items = register.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.register.screen.title)}
        description={t(($) => $.register.screen.description)}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
              {t(($) => $.register.screen.filters.reset)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={exportCsv.isPending}
              onClick={() => exportCsv.mutate()}
            >
              {exportCsv.isPending ? <Spinner /> : <DownloadIcon />}
              {t(($) => $.register.screen.export)}
            </Button>
          </>
        }
      />
      <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
        <Field>
          <FieldLabel htmlFor="register-driver">
            {t(($) => $.register.screen.filters.driver)}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="register-driver"
              type="search"
              autoComplete="off"
              placeholder={t(($) => $.register.screen.filters.driver_placeholder)}
              value={filters.driverName}
              onChange={(e) => set({ driverName: e.target.value })}
            />
          </InputGroup>
        </Field>
        <FilterSelect
          id="register-site"
          label={t(($) => $.register.screen.filters.site)}
          any={t(($) => $.register.screen.filters.all_sites)}
          value={filters.siteId}
          onChange={(siteId) => set({ siteId })}
          choices={sites.map((s) => ({ value: s.id, label: s.name }))}
        />
        <FilterSelect
          id="register-carrier"
          label={t(($) => $.register.screen.filters.carrier)}
          any={t(($) => $.register.screen.filters.all_carriers)}
          value={filters.carrierId}
          onChange={(carrierId) => set({ carrierId })}
          choices={(options?.carriers ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          id="register-instruction"
          label={t(($) => $.register.screen.filters.instruction)}
          any={t(($) => $.register.screen.filters.all_instructions)}
          value={filters.instructionId}
          onChange={(instructionId) => set({ instructionId, versionId: '' })}
          choices={(options?.instructions ?? []).map((i) => ({ value: i.id, label: i.name }))}
        />
        <FilterSelect
          id="register-version"
          label={t(($) => $.register.screen.filters.version)}
          any={t(($) => $.register.screen.filters.all_versions)}
          value={filters.versionId}
          disabled={!versions}
          onChange={(versionId) => set({ versionId })}
          choices={(versions ?? []).map((v) => ({
            value: v.id,
            label: t(($) => $.register.screen.version, { version: v.version }),
          }))}
        />
        <FilterSelect
          id="register-status"
          label={t(($) => $.register.screen.filters.status)}
          any={t(($) => $.register.screen.filters.all_statuses)}
          value={filters.status}
          onChange={(status) => set({ status })}
          choices={values(AckStatus).map((s) => ({
            value: s,
            label: t(($) => $.register.status[s]),
          }))}
        />
      </div>

      {register.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheckIcon />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.register.screen.empty.title)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.register.screen.empty.description)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">
                  {t(($) => $.register.screen.columns.completed)}
                </TableHead>
                <TableHead>{t(($) => $.register.screen.columns.driver)}</TableHead>
                <TableHead>{t(($) => $.register.screen.columns.carrier)}</TableHead>
                <TableHead>{t(($) => $.register.screen.columns.booking)}</TableHead>
                <TableHead>{t(($) => $.register.screen.columns.site)}</TableHead>
                <TableHead>{t(($) => $.register.screen.columns.instruction)}</TableHead>
                <TableHead>{t(($) => $.register.screen.columns.language)}</TableHead>
                <TableHead>{t(($) => $.register.screen.columns.score)}</TableHead>
                <TableHead>{t(($) => $.register.screen.columns.status)}</TableHead>
                <TableHead className="pr-4">
                  {t(($) => $.register.screen.columns.valid_until)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <RegisterRow key={item.id} item={item} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {register.hasNextPage ? (
        <Button
          variant="outline"
          className="w-fit self-center"
          disabled={register.isFetchingNextPage}
          onClick={() => void register.fetchNextPage()}
        >
          {register.isFetchingNextPage ? <Spinner /> : null}
          {t(($) => $.register.screen.more)}
        </Button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  any,
  value,
  choices,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  any: string;
  value: string;
  choices: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        className="w-full"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <NativeSelectOption value="">{any}</NativeSelectOption>
        {choices.map((c) => (
          <NativeSelectOption key={c.value} value={c.value}>
            {c.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function RegisterRow({ item }: { item: RegisterItem }) {
  const { t } = useTranslation('safety');
  const date = useDate();
  const siteTime = useSiteTime();
  const languageName = useLanguageName();
  const zone = item.site?.timeZone;
  return (
    <TableRow>
      <TableCell className="pl-4 whitespace-nowrap">
        <span className="block">{date(item.completedAt, zone)}</span>
        {zone ? <SiteTime {...siteTime(item.completedAt, zone)} className="text-xs" /> : null}
      </TableCell>
      <TableCell className="font-medium">{item.driverName}</TableCell>
      <TableCell>{item.booking?.carrierName ?? ''}</TableCell>
      <TableCell className="font-mono text-xs">
        {item.booking ? (
          item.booking.code
        ) : (
          <span className="text-muted-foreground">{t(($) => $.register.screen.no_booking)}</span>
        )}
      </TableCell>
      <TableCell>{item.site?.name ?? ''}</TableCell>
      <TableCell>
        {item.instruction.name}{' '}
        <span className="text-muted-foreground">
          {t(($) => $.register.screen.version, { version: item.version.version })}
        </span>
      </TableCell>
      <TableCell lang={item.locale}>{languageName(item.locale)}</TableCell>
      <TableCell className="tabular-nums">
        {item.score === null ? '' : t(($) => $.register.screen.score, { score: item.score })}
      </TableCell>
      <TableCell>
        <AckStatusBadge status={item.status} size={BadgeSize.sm} />
      </TableCell>
      <TableCell className="pr-4 whitespace-nowrap">
        {item.expiresAt ? (
          date(item.expiresAt, zone)
        ) : (
          <span className="text-muted-foreground">{t(($) => $.register.screen.no_expiry)}</span>
        )}
      </TableCell>
    </TableRow>
  );
}
