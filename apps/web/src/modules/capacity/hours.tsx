import { zodResolver } from '@hookform/resolvers/zod';
import {
  type HoursRowView,
  PutHours,
  type ResourceView,
} from '@rampflow/shared/modules/booking/api.capacity';
import { ResourceKind } from '@rampflow/shared/modules/booking/values';
import type { DockView } from '@rampflow/shared/modules/core/api.sites';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { useRefreshMasterData } from './queries';
import { zoneNames } from './time';
import { WeekWindowsField } from './week-windows';

// MD-04: weekly hours of the site, and narrower hours of one resource. Times are local wall
// clock in the site zone; `24:00` closes at midnight. A resource without own rows uses the
// site's hours.

const HoursForm = z.object({ rows: PutHours.shape.rows });
type HoursValues = z.input<typeof HoursForm>;

const SITE = 'site';

export function resourceLabel(r: ResourceView, docks: DockView[]): string {
  return r.kind === ResourceKind.pool
    ? r.name
    : (docks.find((d) => d.id === r.dockIds[0])?.code ?? r.name);
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
  const refresh = useRefreshMasterData(orgId);
  const saved: HoursValues = {
    rows: rows.map(({ weekday, opens, closes }) => ({ weekday, opens, closes })),
  };
  const form = useForm<HoursValues>({ resolver: zodResolver(HoursForm), defaultValues: saved });
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
              save.mutate({ rows: [] });
            }}
          />
          <Label htmlFor="own-hours">{t(($) => $.capacity.hours.own_hours)}</Label>
        </div>
      ) : null}
      <WeekWindowsField control={form.control} name="rows" />
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
