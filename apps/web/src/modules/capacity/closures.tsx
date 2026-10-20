import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ClosureView,
  CreateClosure,
  type ResourceView,
} from '@rampflow/shared/modules/booking/api.capacity';
import { ClosureKind, ClosureSource } from '@rampflow/shared/modules/booking/values';
import type { DockView } from '@rampflow/shared/modules/core/api.sites';
import { values } from '@rampflow/shared/values';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarOffIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { tenantContextQuery } from '@/lib/access';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useIssueText } from './form';
import { resourceLabel } from './hours';
import { useRefreshMasterData } from './queries';
import { formatLocalDate, zoneAt } from './time';

// MD-04: closures and blocks of the site or one resource, and the public holidays the import
// job keeps for the next 400 days. Manual closures are deleted; holidays are reopened instead.

const DATE_HOLIDAYS = 'https://github.com/commenthol/date-holidays';

/** A closure from midnight to midnight covers whole days. */
const MIDNIGHT = '00:00';

function When({ c, timeZone }: { c: ClosureView; timeZone: string }) {
  const locale = useLocale();
  const [startDay, startTime] = c.startsLocal.split('T') as [string, string];
  const [endDay, endTime] = c.endsLocal.split('T') as [string, string];
  const wholeDays = startTime === MIDNIGHT && endTime === MIDNIGHT;
  const zone = zoneAt(c.startsLocal, timeZone, locale);
  if (wholeDays) {
    const lastDay = new Date(Date.parse(`${endDay}T00:00:00Z`) - 86_400_000).toISOString();
    const last = lastDay.slice(0, 10);
    return (
      <span>
        {formatLocalDate(startDay, locale)}
        {last === startDay ? null : ` – ${formatLocalDate(last, locale)}`}
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {formatLocalDate(startDay, locale)} {startTime} –{' '}
      {endDay === startDay ? '' : `${formatLocalDate(endDay, locale)} `}
      {endTime}
      <span className="ml-1 text-[0.8em] font-medium text-muted-foreground">{zone}</span>
    </span>
  );
}

export function ClosuresCard({
  orgId,
  siteId,
  timeZone,
  closures,
  resources,
  docks,
}: {
  orgId: string;
  siteId: string;
  timeZone: string;
  closures: ClosureView[];
  resources: ResourceView[];
  docks: DockView[];
}) {
  const { t } = useTranslation('booking');
  const [adding, setAdding] = useState(false);
  const refresh = useRefreshMasterData(orgId);
  const context = useQuery(tenantContextQuery(orgId)).data;
  const holidaysClose =
    context?.settings[siteId]?.['booking.close_on_public_holidays']?.value !== false;
  const remove = useMutation({
    mutationFn: (closureId: string) =>
      call(
        api.t[':orgId'].capacity.closures[':closureId'].$delete({ param: { orgId, closureId } }),
      ),
    onSuccess: () => toast.success(t(($) => $.capacity.closures.deleted)),
    onSettled: refresh,
  });
  const reopen = useMutation({
    mutationFn: (closureId: string) =>
      call(
        api.t[':orgId'].capacity.closures[':closureId'].reopen.$post({
          param: { orgId, closureId },
        }),
      ),
    onSuccess: () => toast.success(t(($) => $.capacity.closures.reopened_toast)),
    onSettled: refresh,
  });
  const nameOf = (resourceId: string | null) => {
    const r = resources.find((x) => x.id === resourceId);
    return r ? resourceLabel(r, docks) : t(($) => $.capacity.closures.whole_site);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.capacity.closures.title)}</CardTitle>
        <CardDescription>{t(($) => $.capacity.closures.description)}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon /> {t(($) => $.capacity.closures.add)}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-0">
        {holidaysClose ? null : (
          <p className="mx-6 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs">
            {t(($) => $.capacity.closures.holidays_off)}
          </p>
        )}
        {closures.length === 0 ? (
          <p className="flex items-center gap-2 px-6 text-sm text-muted-foreground">
            <CalendarOffIcon className="size-4" aria-hidden /> {t(($) => $.capacity.closures.empty)}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">
                    {t(($) => $.capacity.closures.columns.when)}
                  </TableHead>
                  <TableHead>{t(($) => $.capacity.closures.columns.applies_to)}</TableHead>
                  <TableHead>{t(($) => $.capacity.closures.columns.kind)}</TableHead>
                  <TableHead>{t(($) => $.capacity.closures.columns.reason)}</TableHead>
                  <TableHead className="pr-6">
                    <span className="sr-only">{t(($) => $.capacity.closures.columns.actions)}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closures.map((c) => {
                  const reopened = c.reopenedAt !== null;
                  return (
                    <TableRow key={c.id} className={cn(reopened && 'text-muted-foreground')}>
                      <TableCell className="pl-6">
                        <When c={c} timeZone={timeZone} />
                      </TableCell>
                      <TableCell>{nameOf(c.resourceId)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {t(($) => $.capacity.closures.kinds[c.kind])}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.source === ClosureSource.holiday ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {c.holidayName}
                            <Badge variant="secondary">
                              {reopened
                                ? t(($) => $.capacity.closures.reopened)
                                : t(($) => $.capacity.closures.holiday)}
                            </Badge>
                          </span>
                        ) : (
                          (c.reason ?? '')
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        {c.source === ClosureSource.manual ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(c.id)}
                          >
                            <Trash2Icon /> {t(($) => $.capacity.closures.delete)}
                          </Button>
                        ) : reopened ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={reopen.isPending}
                            onClick={() => reopen.mutate(c.id)}
                          >
                            <RotateCcwIcon /> {t(($) => $.capacity.closures.reopen)}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="px-6 text-xs text-muted-foreground">
          {t(($) => $.capacity.closures.attribution_before)}{' '}
          <a
            href={DATE_HOLIDAYS}
            className="underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            date-holidays
          </a>{' '}
          {t(($) => $.capacity.closures.attribution_after)}
        </p>
      </CardContent>
      <ClosureDialog
        orgId={orgId}
        siteId={siteId}
        resources={resources}
        docks={docks}
        open={adding}
        onOpenChange={setAdding}
      />
    </Card>
  );
}

type ClosureValues = z.input<typeof CreateClosure>;

function ClosureDialog({
  orgId,
  siteId,
  resources,
  docks,
  open,
  onOpenChange,
}: {
  orgId: string;
  siteId: string;
  resources: ResourceView[];
  docks: DockView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('booking');
  const message = useIssueText();
  const refresh = useRefreshMasterData(orgId);
  const empty: ClosureValues = {
    siteId,
    resourceId: null,
    kind: ClosureKind.closed,
    startsLocal: '',
    endsLocal: '',
    reason: null,
  };
  const form = useForm<ClosureValues>({
    resolver: zodResolver(CreateClosure),
    defaultValues: empty,
  });
  const save = useMutation({
    mutationFn: (body: ClosureValues) =>
      call(api.t[':orgId'].capacity.closures.$post({ param: { orgId }, json: body })),
    onSuccess: async () => {
      await refresh();
      toast.success(t(($) => $.capacity.closures.saved));
      form.reset(empty);
      onOpenChange(false);
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  const bookable = resources.filter((r) => r.active && r.dockIds.length > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form noValidate onSubmit={form.handleSubmit((body) => save.mutate(body))}>
          <DialogHeader>
            <DialogTitle>{t(($) => $.capacity.closures.add)}</DialogTitle>
            <DialogDescription>{t(($) => $.capacity.closures.form_description)}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="resourceId"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="closure-resource">
                      {t(($) => $.capacity.closures.columns.applies_to)}
                    </FieldLabel>
                    <NativeSelect
                      id="closure-resource"
                      className="w-full"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    >
                      <NativeSelectOption value="">
                        {t(($) => $.capacity.closures.whole_site)}
                      </NativeSelectOption>
                      {bookable.map((r) => (
                        <NativeSelectOption key={r.id} value={r.id}>
                          {resourceLabel(r, docks)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
              />
              <Controller
                name="kind"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="closure-kind">
                      {t(($) => $.capacity.closures.columns.kind)}
                    </FieldLabel>
                    <NativeSelect id="closure-kind" className="w-full" {...field}>
                      {values(ClosureKind).map((k) => (
                        <NativeSelectOption key={k} value={k}>
                          {t(($) => $.capacity.closures.kinds[k])}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
              />
              {(
                [
                  ['startsLocal', t(($) => $.capacity.closures.starts)],
                  ['endsLocal', t(($) => $.capacity.closures.ends)],
                ] as const
              ).map(([name, label]) => (
                <Controller
                  key={name}
                  name={name}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`closure-${name}`}>{label}</FieldLabel>
                      <Input
                        id={`closure-${name}`}
                        type="datetime-local"
                        step={300}
                        {...field}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldError>{message(fieldState.error)}</FieldError>
                    </Field>
                  )}
                />
              ))}
            </div>
            <Controller
              name="reason"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="closure-reason">
                    {t(($) => $.capacity.closures.columns.reason)}
                  </FieldLabel>
                  <Input
                    id="closure-reason"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                  <FieldError>{message(fieldState.error)}</FieldError>
                </Field>
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(($) => $.capacity.closures.no_cancel)}
            </p>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t(($) => $.capacity.closures.cancel)}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {t(($) => $.capacity.closures.create)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
