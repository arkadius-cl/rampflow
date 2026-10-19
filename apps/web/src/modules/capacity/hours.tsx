import { zodResolver } from '@hookform/resolvers/zod';
import {
  type HoursRowView,
  PutHours,
  type ResourceView,
} from '@rampflow/shared/modules/booking/api.capacity';
import type { DockView } from '@rampflow/shared/modules/core/api.sites';
import { useMutation } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Controller,
  type FieldError as HookFieldError,
  useFieldArray,
  useForm,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { useIssueText } from './form';
import { useRefreshMasterData } from './queries';
import { weekdayName, zoneNames } from './time';

// MD-04: weekly hours of the site, and narrower hours of one resource. Times are local wall
// clock in the site zone; `24:00` closes at midnight. A resource without own rows uses the
// site's hours.

const HoursForm = z.object({ rows: PutHours.shape.rows });
type HoursValues = z.input<typeof HoursForm>;

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const SITE = 'site';

export function resourceLabel(r: ResourceView, docks: DockView[]): string {
  return r.kind === 'pool' ? r.name : (docks.find((d) => d.id === r.dockIds[0])?.code ?? r.name);
}

export function HoursCard({
  orgId,
  siteId,
  timeZone,
  rows,
  resources,
  docks,
}: {
  orgId: string;
  siteId: string;
  timeZone: string;
  rows: HoursRowView[];
  resources: ResourceView[];
  docks: DockView[];
}) {
  const { t } = useTranslation('booking');
  const locale = useLocale();
  const [scope, setScope] = useState<string>(SITE);
  const bookable = resources.filter((r) => r.active && r.dockIds.length > 0);
  const resourceId = scope === SITE ? null : scope;
  const own = rows.filter((r) => r.resourceId === resourceId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.capacity.hours.title)}</CardTitle>
        <CardDescription>
          {t(($) => $.capacity.hours.description, {
            zone: `${timeZone} (${zoneNames(timeZone, locale)})`,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field className="max-w-xs">
          <FieldLabel htmlFor="hours-scope">{t(($) => $.capacity.hours.scope)}</FieldLabel>
          <NativeSelect
            id="hours-scope"
            className="w-full"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <NativeSelectOption value={SITE}>
              {t(($) => $.capacity.hours.site_scope)}
            </NativeSelectOption>
            {bookable.map((r) => (
              <NativeSelectOption key={r.id} value={r.id}>
                {resourceLabel(r, docks)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <HoursEditor
          key={`${scope}:${own.length}`}
          orgId={orgId}
          siteId={siteId}
          resourceId={resourceId}
          rows={own}
        />
      </CardContent>
    </Card>
  );
}

function HoursEditor({
  orgId,
  siteId,
  resourceId,
  rows,
}: {
  orgId: string;
  siteId: string;
  /** null: the site's hours. */
  resourceId: string | null;
  rows: HoursRowView[];
}) {
  const { t } = useTranslation('booking');
  const locale = useLocale();
  const message = useIssueText();
  const refresh = useRefreshMasterData(orgId);
  const saved: HoursValues = {
    rows: rows.map(({ weekday, opens, closes }) => ({ weekday, opens, closes })),
  };
  const form = useForm<HoursValues>({ resolver: zodResolver(HoursForm), defaultValues: saved });
  const windows = useFieldArray({ control: form.control, name: 'rows' });
  const [ownHours, setOwnHours] = useState(resourceId === null || rows.length > 0);
  const save = useMutation({
    mutationFn: (v: HoursValues) =>
      call(
        api.t[':orgId'].capacity.hours.$put({
          param: { orgId },
          json: { siteId, resourceId, rows: v.rows },
        }),
      ),
    onSuccess: async () => {
      await refresh();
      toast.success(t(($) => $.capacity.hours.saved));
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });

  if (resourceId !== null && !ownHours) {
    return (
      <div className="flex items-center gap-2">
        <Switch id="own-hours" checked={false} onCheckedChange={setOwnHours} />
        <Label htmlFor="own-hours">{t(($) => $.capacity.hours.own_hours)}</Label>
        <span className="text-sm text-muted-foreground">
          {t(($) => $.capacity.hours.uses_site)}
        </span>
      </div>
    );
  }

  const time = (index: number, part: 'opens' | 'closes', label: string) => (
    <Controller
      name={`rows.${index}.${part}`}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className="w-24">
          <Input
            {...field}
            aria-label={label}
            inputMode="numeric"
            placeholder="HH:MM"
            maxLength={5}
            aria-invalid={fieldState.invalid}
          />
        </Field>
      )}
    />
  );

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
      className="flex flex-col gap-3"
    >
      {resourceId !== null ? (
        <div className="flex items-center gap-2">
          <Switch
            id="own-hours"
            checked
            onCheckedChange={(on) => {
              if (on) return;
              setOwnHours(false);
              save.mutate({ rows: [] });
            }}
          />
          <Label htmlFor="own-hours">{t(($) => $.capacity.hours.own_hours)}</Label>
        </div>
      ) : null}
      <div className="divide-y rounded-lg border">
        {WEEKDAYS.map((weekday) => {
          const day = weekdayName(weekday, locale);
          const entries = windows.fields
            .map((f, index) => ({ f, index }))
            .filter(({ f }) => f.weekday === weekday);
          return (
            <div key={weekday} className="flex flex-wrap items-start gap-3 px-3 py-2">
              <div className="w-28 pt-1.5 text-sm font-medium">{day}</div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {entries.length === 0 ? (
                  <span className="pt-1.5 text-sm text-muted-foreground">
                    {t(($) => $.capacity.hours.closed)}
                  </span>
                ) : null}
                {entries.map(({ f, index }) => {
                  const err = form.formState.errors.rows?.[index];
                  const issue: HookFieldError | undefined =
                    err?.closes ?? err?.opens ?? (err?.type ? (err as HookFieldError) : undefined);
                  return (
                    <div key={f.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {time(
                          index,
                          'opens',
                          t(($) => $.capacity.hours.opens_on, { day }),
                        )}
                        <span aria-hidden>–</span>
                        {time(
                          index,
                          'closes',
                          t(($) => $.capacity.hours.closes_on, { day }),
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t(($) => $.capacity.hours.remove_window, { day })}
                          onClick={() => windows.remove(index)}
                        >
                          <XIcon />
                        </Button>
                      </div>
                      {issue ? <FieldError>{message(issue)}</FieldError> : null}
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t(($) => $.capacity.hours.add_window_on, { day })}
                onClick={() => windows.append({ weekday, opens: '08:00', closes: '16:00' })}
              >
                <PlusIcon /> {t(($) => $.capacity.hours.add_window)}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t(($) => $.capacity.hours.midnight_hint)}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => form.reset(saved)}>
          {t(($) => $.capacity.resources.discard)}
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {t(($) => $.capacity.hours.save)}
        </Button>
      </div>
    </form>
  );
}
