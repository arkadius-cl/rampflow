import { zodResolver } from '@hookform/resolvers/zod';
import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import {
  type SubjectAcknowledgement,
  type SubjectMatches,
  SubjectQuery,
} from '@rampflow/shared/modules/privacy/api';
import { BadgeSize, EmailCategory, HtmlInputType, Permission } from '@rampflow/shared/values';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { DownloadIcon, EraserIcon, SearchIcon, UserSearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, type FieldError as FormFieldError, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shells/office-shell';
import { SiteTime } from '@/components/site-time';
import { BookingStatusBadge } from '@/components/status-badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { guard } from '@/lib/access';
import { useLocale } from '@/lib/i18n';
import { useSiteTime } from '@/lib/time';
import { eraseSubject, exportSubject, searchSubject } from '@/modules/privacy/requests';
import { LOCALE_TAG } from '@/modules/report/display';

// TN-06: find what is stored about a driver, export it (Art. 15) or erase it (Art. 17, 18).
// Nothing typed here reaches the URL or the query cache.

export const Route = createFileRoute('/t/$orgId/privacy/')({
  beforeLoad: guard({ permission: Permission.privacy.manage_requests }),
  component: PrivacyPage,
});

type Values = { name: string; phone: string; plate: string };
const EMPTY: Values = { name: '', phone: '', plate: '' };
const FIELDS = Object.keys(EMPTY) as (keyof Values)[];
/** The field the shared schema's "at least one identifier" refinement reports on. */
const IDENTIFIER_FIELD: keyof Values = 'name';
const INPUT_TYPE: Record<keyof Values, HtmlInputType> = {
  name: HtmlInputType.search,
  phone: HtmlInputType.tel,
  plate: HtmlInputType.search,
};

function PrivacyPage() {
  const { t } = useTranslation('privacy');
  const { orgId } = Route.useParams();
  const [query, setQuery] = useState<SubjectQuery | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(SubjectQuery) as never,
    defaultValues: EMPTY,
  });
  const search = useMutation({ mutationFn: (q: SubjectQuery) => searchSubject(orgId, q) });
  const exported = useMutation({
    mutationFn: (q: SubjectQuery) => exportSubject(orgId, q),
    onSuccess: () => toast.success(t(($) => $.requests.exported)),
  });

  const submit = form.handleSubmit((values) => {
    setQuery(values);
    search.mutate(values);
  });
  const clear = () => {
    form.reset(EMPTY);
    setQuery(null);
    search.reset();
  };
  const message = (field: keyof Values, error: FormFieldError | undefined) => {
    if (!error) return undefined;
    if (field === IDENTIFIER_FIELD && error.type === 'custom')
      return t(($) => $.requests.errors.identifier);
    return t(($) => $.requests.errors[field]);
  };
  const matches = search.data;
  const found = matches && (matches.bookings.length > 0 || matches.acknowledgements.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.requests.title)}
        description={t(($) => $.requests.description)}
        actions={
          found && query ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={exported.isPending}
                onClick={() => exported.mutate(query)}
              >
                {exported.isPending ? <Spinner /> : <DownloadIcon />}
                {t(($) => $.requests.export)}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEraseOpen(true)}>
                <EraserIcon />
                {t(($) => $.requests.erase)}
              </Button>
            </>
          ) : null
        }
      />
      <form onSubmit={submit} noValidate className="rounded-xl border bg-card p-3">
        <FieldGroup className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map((field) => (
            <Controller
              key={field}
              name={field}
              control={form.control}
              render={({ field: input, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`privacy-${field}`}>
                    {t(($) => $.requests.form[field])}
                  </FieldLabel>
                  <Input
                    {...input}
                    id={`privacy-${field}`}
                    type={INPUT_TYPE[field]}
                    autoComplete="off"
                    placeholder={t(($) => $.requests.form[`${field}_placeholder`])}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError>{message(field, fieldState.error)}</FieldError>
                </Field>
              )}
            />
          ))}
        </FieldGroup>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <FieldDescription className="max-w-2xl">
            {t(($) => $.requests.form.hint)}
          </FieldDescription>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={clear}>
              {t(($) => $.requests.form.clear)}
            </Button>
            <Button type="submit" disabled={search.isPending}>
              {search.isPending ? <Spinner /> : <SearchIcon />}
              {t(($) => $.requests.form.search)}
            </Button>
          </div>
        </div>
      </form>

      {!matches ? (
        <Notice
          title={t(($) => $.requests.start.title)}
          description={t(($) => $.requests.start.description)}
        />
      ) : !found ? (
        <Notice
          title={t(($) => $.requests.no_match.title)}
          description={t(($) => $.requests.no_match.description)}
        />
      ) : (
        <Results matches={matches} />
      )}

      {matches && query ? (
        <EraseDialog
          orgId={orgId}
          query={query}
          matches={matches}
          open={eraseOpen}
          onOpenChange={setEraseOpen}
          onErased={() => search.mutate(query)}
        />
      ) : null}
    </div>
  );
}

function Notice({ title, description }: { title: string; description: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UserSearchIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function useDay() {
  const locale = useLocale();
  return (iso: string, timeZone?: string) =>
    new Intl.DateTimeFormat(LOCALE_TAG[locale], { dateStyle: 'medium', timeZone }).format(
      new Date(iso),
    );
}

function Results({ matches }: { matches: SubjectMatches }) {
  const { t } = useTranslation(['privacy', 'booking']);
  const siteTime = useSiteTime();
  const day = useDay();
  const none = <span className="text-muted-foreground">{t(($) => $.requests.none)}</span>;
  return (
    <>
      <section aria-labelledby="privacy-bookings" className="flex flex-col gap-2">
        <h2 id="privacy-bookings" className="text-base font-semibold">
          {t(($) => $.requests.bookings.title)}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {t(($) => $.requests.bookings.count, { count: matches.bookings.length })}
          </span>
        </h2>
        {matches.bookings.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">
                    {t(($) => $.requests.bookings.columns.slot)}
                  </TableHead>
                  <TableHead>{t(($) => $.requests.bookings.columns.code)}</TableHead>
                  <TableHead>{t(($) => $.requests.bookings.columns.site)}</TableHead>
                  <TableHead>{t(($) => $.requests.bookings.columns.carrier)}</TableHead>
                  <TableHead>{t(($) => $.requests.bookings.columns.driver)}</TableHead>
                  <TableHead>{t(($) => $.requests.bookings.columns.phone)}</TableHead>
                  <TableHead>{t(($) => $.requests.bookings.columns.plates)}</TableHead>
                  <TableHead className="pr-4">
                    {t(($) => $.requests.bookings.columns.status)}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.bookings.map((b) => {
                  const plates = [b.plate, b.trailerPlate, b.plateSeen].filter(
                    (p, i, all): p is string => p !== null && all.indexOf(p) === i,
                  );
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="pl-4 whitespace-nowrap">
                        <span className="mr-1">{day(b.startsAt, b.site.timeZone)}</span>
                        <SiteTime {...siteTime(b.startsAt, b.site.timeZone)} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.code}</TableCell>
                      <TableCell>{b.site.name}</TableCell>
                      <TableCell>{b.carrierName}</TableCell>
                      <TableCell className="font-medium">{b.driverName ?? none}</TableCell>
                      <TableCell className="tabular-nums">{b.driverPhone ?? none}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {plates.length > 0 ? plates.join(', ') : none}
                      </TableCell>
                      <TableCell className="pr-4">
                        {b.status === BookingStatus.requested ? null : (
                          <BookingStatusBadge
                            status={b.status}
                            size={BadgeSize.sm}
                            label={t(($) => $.lifecycle.status[b.status], {
                              ns: EmailCategory.booking,
                            })}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </section>
      <section aria-labelledby="privacy-acknowledgements" className="flex flex-col gap-2">
        <h2 id="privacy-acknowledgements" className="text-base font-semibold">
          {t(($) => $.requests.acknowledgements.title)}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {t(($) => $.requests.acknowledgements.count, {
              count: matches.acknowledgements.length,
            })}
          </span>
        </h2>
        {matches.acknowledgements.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">
                    {t(($) => $.requests.acknowledgements.columns.completed)}
                  </TableHead>
                  <TableHead>{t(($) => $.requests.acknowledgements.columns.driver)}</TableHead>
                  <TableHead>{t(($) => $.requests.acknowledgements.columns.instruction)}</TableHead>
                  <TableHead>{t(($) => $.requests.acknowledgements.columns.booking)}</TableHead>
                  <TableHead className="pr-4">
                    {t(($) => $.requests.acknowledgements.columns.retention)}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.acknowledgements.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4 whitespace-nowrap">{day(a.completedAt)}</TableCell>
                    <TableCell className="font-medium">{a.driverName}</TableCell>
                    <TableCell>
                      {a.instruction.name}{' '}
                      <span className="text-muted-foreground">
                        {t(($) => $.requests.acknowledgements.version, { version: a.version })}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.bookingCode ?? none}</TableCell>
                    <TableCell className="pr-4">
                      <RetentionBadge ack={a} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </section>
    </>
  );
}

function RetentionBadge({ ack }: { ack: SubjectAcknowledgement }) {
  const { t } = useTranslation('privacy');
  if (ack.restrictedAt) {
    return <Badge variant="secondary">{t(($) => $.requests.acknowledgements.restricted)}</Badge>;
  }
  return (
    <span className="text-sm text-muted-foreground">
      {ack.retentionEnded
        ? t(($) => $.requests.acknowledgements.retention_ended)
        : t(($) => $.requests.acknowledgements.under_retention)}
    </span>
  );
}

function EraseDialog(props: {
  orgId: string;
  query: SubjectQuery;
  matches: SubjectMatches;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onErased: () => void;
}) {
  const { t } = useTranslation('privacy');
  const [confirmed, setConfirmed] = useState(false);
  const { bookings, acknowledgements } = props.matches;
  const restrict = acknowledgements.filter((a) => !a.retentionEnded && !a.restrictedAt).length;
  const pseudonymize = acknowledgements.filter((a) => a.retentionEnded).length;
  const erase = useMutation({
    mutationFn: () => eraseSubject(props.orgId, props.query),
    onSuccess: (r) => {
      toast.success(
        t(($) => $.requests.erased, {
          bookings: r.pseudonymizedBookings,
          restricted: r.restrictedAcknowledgements,
          pseudonymized: r.pseudonymizedAcknowledgements,
        }),
      );
      props.onOpenChange(false);
      setConfirmed(false);
      props.onErased();
    },
  });
  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open);
        if (!open) setConfirmed(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(($) => $.requests.erase_dialog.title)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(($) => $.requests.erase_dialog.description)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t(($) => $.requests.erase_dialog.bookings, { count: bookings.length })}</li>
          <li>{t(($) => $.requests.erase_dialog.restrict, { count: restrict })}</li>
          <li>{t(($) => $.requests.erase_dialog.pseudonymize, { count: pseudonymize })}</li>
        </ul>
        <Field orientation="horizontal">
          <Checkbox
            id="privacy-erase-confirm"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
          />
          <FieldLabel htmlFor="privacy-erase-confirm">
            {t(($) => $.requests.erase_dialog.confirm)}
          </FieldLabel>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>{t(($) => $.requests.erase_dialog.cancel)}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!confirmed || erase.isPending}
            onClick={() => erase.mutate()}
          >
            {erase.isPending ? <Spinner /> : <EraserIcon />}
            {t(($) => $.requests.erase_dialog.submit)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
