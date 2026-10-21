import { zodResolver } from '@hookform/resolvers/zod';
import type { LoadTypeView, ResourceView } from '@rampflow/shared/modules/booking/api.capacity';
import { ResourceKind } from '@rampflow/shared/modules/booking/values';
import {
  CreateDock,
  CreateHall,
  type DockView,
  type HallView,
} from '@rampflow/shared/modules/core/api.sites';
import { DockStatus, DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { values } from '@rampflow/shared/values';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  LayersIcon,
  PencilIcon,
  PlusIcon,
  SquareIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
import { Checkbox } from '@/components/ui/checkbox';
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
import { api, call } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLoadTypeName } from '@/modules/booking/display';
import { BookedAsLabel, BookedAsSelect, sameProfile } from './booked-as';
import { useIssueText } from './form';
import { useRefreshMasterData } from './queries';

// MD-02: halls as cards with their dock tables; each dock row says how the dock is booked (MD-03).

/** What the dock dialogs edit: a new dock of a hall, or an existing dock. */
export type DockEdit = { hallId: string } | { dock: DockView };

export function HallCard({
  orgId,
  hall,
  docks,
  holderOf,
  pools,
  canBook,
  onRename,
  onDock,
}: {
  orgId: string;
  hall: HallView;
  docks: DockView[];
  holderOf: (dock: DockView) => ResourceView | undefined;
  pools: ResourceView[];
  /** `booking.manage_resources`: the "Booked as" column is a select. */
  canBook: boolean;
  onRename: () => void;
  onDock: (edit: DockEdit) => void;
}) {
  const { t } = useTranslation();
  const { t: tb } = useTranslation('booking');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{hall.name}</CardTitle>
        <CardDescription>{t(($) => $.sites.halls.count, { n: docks.length })}</CardDescription>
        <CardAction className="flex gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t(($) => $.sites.halls.rename_named, { name: hall.name })}
            onClick={onRename}
          >
            <PencilIcon />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDock({ hallId: hall.id })}>
            <PlusIcon /> {t(($) => $.sites.docks.new)}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {docks.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">{t(($) => $.sites.docks.empty)}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t(($) => $.sites.docks.columns.code)}</TableHead>
                <TableHead>{t(($) => $.sites.docks.columns.door)}</TableHead>
                <TableHead>{t(($) => $.sites.docks.columns.zone)}</TableHead>
                <TableHead>{t(($) => $.sites.docks.columns.adr)}</TableHead>
                <TableHead>{t(($) => $.sites.docks.columns.status)}</TableHead>
                <TableHead>{tb(($) => $.capacity.booked_as.column)}</TableHead>
                <TableHead className="pr-6">
                  <span className="sr-only">{t(($) => $.sites.docks.columns.actions)}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docks.map((d) => (
                <TableRow
                  key={d.id}
                  className={cn(d.status === DockStatus.inactive && 'text-muted-foreground')}
                >
                  <TableCell className="pl-6 font-semibold">{d.code}</TableCell>
                  <TableCell>{t(($) => $.sites.door_types[d.doorType])}</TableCell>
                  <TableCell>{t(($) => $.sites.zones[d.temperatureZone])}</TableCell>
                  <TableCell>
                    {d.adrAllowed
                      ? t(($) => $.sites.docks.adr_yes)
                      : t(($) => $.sites.docks.adr_no)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {d.status === DockStatus.maintenance ? <WrenchIcon aria-hidden /> : null}
                      {t(($) => $.sites.statuses[d.status])}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canBook ? (
                      <BookedAsSelect orgId={orgId} dock={d} holder={holderOf(d)} pools={pools} />
                    ) : (
                      <BookedAsLabel holder={holderOf(d)} />
                    )}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t(($) => $.sites.docks.edit, { code: d.code })}
                      onClick={() => onDock({ dock: d })}
                    >
                      <PencilIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

type HallValues = z.input<typeof CreateHall>;

/** Creates a hall, or renames `hall`. */
export function HallDialog({
  orgId,
  siteId,
  hall,
  open,
  onOpenChange,
}: {
  orgId: string;
  siteId: string;
  hall: HallView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const message = useIssueText();
  const refresh = useRefreshMasterData(orgId);
  const form = useForm<HallValues>({
    resolver: zodResolver(CreateHall),
    values: { name: hall?.name ?? '' },
  });
  const save = useMutation({
    mutationFn: (body: HallValues) =>
      hall
        ? call(
            api.t[':orgId'].sites[':siteId'].halls[':hallId'].$patch({
              param: { orgId, siteId, hallId: hall.id },
              json: body,
            }),
          )
        : call(
            api.t[':orgId'].sites[':siteId'].halls.$post({ param: { orgId, siteId }, json: body }),
          ),
    onSuccess: async () => {
      await refresh();
      toast.success(t(($) => $.sites.saved));
      onOpenChange(false);
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form noValidate onSubmit={form.handleSubmit((body) => save.mutate(body))}>
          <DialogHeader>
            <DialogTitle>
              {hall ? t(($) => $.sites.halls.rename) : t(($) => $.sites.halls.new)}
            </DialogTitle>
            <DialogDescription>{t(($) => $.sites.halls.description)}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="hall-name">{t(($) => $.sites.halls.name)}</FieldLabel>
                  <Input id="hall-name" {...field} aria-invalid={fieldState.invalid} />
                  <FieldError>{message(fieldState.error)}</FieldError>
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t(($) => $.sites.cancel)}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {t(($) => $.sites.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DockValues = z.input<typeof CreateDock>;

/**
 * Creates a dock in a hall, or edits one (MD-02). An existing dock shows what it is bookable for:
 * its resource and that resource's active load types, when the user may see them.
 */
export function DockDialog({
  orgId,
  siteId,
  halls,
  edit,
  holderOf,
  loadTypes,
  onOpenChange,
}: {
  orgId: string;
  siteId: string;
  halls: HallView[];
  edit: DockEdit | null;
  holderOf: (dock: DockView) => ResourceView | undefined;
  /** The site's load types; `undefined` without `booking.view`. */
  loadTypes: LoadTypeView[] | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const message = useIssueText();
  const refresh = useRefreshMasterData(orgId);
  const existing = edit && 'dock' in edit ? edit.dock : null;
  const form = useForm<DockValues>({
    resolver: zodResolver(CreateDock),
    values: existing
      ? {
          hallId: existing.hallId,
          code: existing.code,
          doorType: existing.doorType,
          temperatureZone: existing.temperatureZone,
          adrAllowed: existing.adrAllowed,
          status: existing.status,
        }
      : {
          hallId: edit && 'hallId' in edit ? edit.hallId : (halls[0]?.id ?? ''),
          code: '',
          doorType: DoorType.dock_leveler,
          temperatureZone: TemperatureZone.ambient,
          adrAllowed: false,
          status: DockStatus.active,
        },
  });
  const save = useMutation({
    mutationFn: (body: DockValues) =>
      existing
        ? call(
            api.t[':orgId'].sites[':siteId'].docks[':dockId'].$patch({
              param: { orgId, siteId, dockId: existing.id },
              json: body,
            }),
          )
        : call(
            api.t[':orgId'].sites[':siteId'].docks.$post({ param: { orgId, siteId }, json: body }),
          ),
    onSuccess: async () => {
      await refresh();
      toast.success(t(($) => $.sites.saved));
      onOpenChange(false);
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  const holder = existing ? holderOf(existing) : undefined;
  const [doorType, temperatureZone, adrAllowed] = useWatch({
    control: form.control,
    name: ['doorType', 'temperatureZone', 'adrAllowed'],
  });
  const moves =
    holder?.kind === ResourceKind.pool &&
    !sameProfile(holder, { doorType, temperatureZone, adrAllowed: adrAllowed ?? false });
  const select = (
    name: keyof Pick<DockValues, 'hallId' | 'doorType' | 'temperatureZone' | 'status'>,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`dock-${name}`}>{label}</FieldLabel>
          <NativeSelect id={`dock-${name}`} className="w-full" {...field}>
            {options.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError>{message(fieldState.error)}</FieldError>
        </Field>
      )}
    />
  );
  return (
    <Dialog open={edit !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form noValidate onSubmit={form.handleSubmit((body) => save.mutate(body))}>
          <DialogHeader>
            <DialogTitle>
              {existing
                ? t(($) => $.sites.docks.edit, { code: existing.code })
                : t(($) => $.sites.docks.new_title)}
            </DialogTitle>
            <DialogDescription>{t(($) => $.sites.docks.description)}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="code"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="dock-code">
                      {t(($) => $.sites.docks.fields.code)}
                    </FieldLabel>
                    <Input id="dock-code" {...field} aria-invalid={fieldState.invalid} />
                    <FieldError>{message(fieldState.error)}</FieldError>
                  </Field>
                )}
              />
              {select(
                'hallId',
                t(($) => $.sites.docks.fields.hall),
                halls.map((h) => ({ value: h.id, label: h.name })),
              )}
              {select(
                'doorType',
                t(($) => $.sites.docks.fields.door),
                values(DoorType).map((v) => ({ value: v, label: t(($) => $.sites.door_types[v]) })),
              )}
              {select(
                'temperatureZone',
                t(($) => $.sites.docks.fields.zone),
                values(TemperatureZone).map((v) => ({
                  value: v,
                  label: t(($) => $.sites.zones[v]),
                })),
              )}
              {select(
                'status',
                t(($) => $.sites.docks.fields.status),
                values(DockStatus).map((v) => ({ value: v, label: t(($) => $.sites.statuses[v]) })),
              )}
            </div>
            <Controller
              name="adrAllowed"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="dock-adr"
                    checked={field.value ?? false}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="dock-adr">{t(($) => $.sites.docks.fields.adr)}</FieldLabel>
                </Field>
              )}
            />
            <p className="text-xs text-muted-foreground">{t(($) => $.sites.docks.status_hint)}</p>
            {moves ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-md border border-tone-onsite-border bg-tone-onsite-bg px-3 py-2 text-xs text-tone-onsite"
              >
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t(($) => $.sites.docks.moves_on_save)}
              </p>
            ) : null}
            {holder && loadTypes ? (
              <BookableFor orgId={orgId} siteId={siteId} holder={holder} loadTypes={loadTypes} />
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t(($) => $.sites.cancel)}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {t(($) => $.sites.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** MD-02: the dock's resource and the names of its active load types, read-only. */
function BookableFor({
  orgId,
  siteId,
  holder,
  loadTypes,
}: {
  orgId: string;
  siteId: string;
  holder: ResourceView;
  loadTypes: LoadTypeView[];
}) {
  const { t } = useTranslation();
  const loadTypeName = useLoadTypeName();
  const names = loadTypes
    .filter((l) => l.active && holder.loadTypeIds.includes(l.id))
    .map((l) => loadTypeName(l.name));
  const Icon = holder.kind === ResourceKind.pool ? LayersIcon : SquareIcon;
  return (
    <section
      aria-labelledby="dock-bookable-for"
      className="flex flex-col gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-sm"
    >
      <h3 id="dock-bookable-for" className="font-medium">
        {t(($) => $.sites.docks.bookable_for)}
      </h3>
      <p className="inline-flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        {holder.kind === ResourceKind.pool
          ? t(($) => $.sites.docks.in_pool, { name: holder.name })
          : t(($) => $.sites.docks.single)}
      </p>
      <p className={cn(names.length === 0 && 'text-muted-foreground')}>
        {names.length > 0 ? names.join(', ') : t(($) => $.sites.docks.no_load_types)}
      </p>
      <Link
        to="/t/$orgId/sites/$siteId/load-types"
        params={{ orgId, siteId }}
        className="w-fit text-sm underline underline-offset-4"
      >
        {t(($) => $.sites.docks.edit_load_types)}
      </Link>
    </section>
  );
}
