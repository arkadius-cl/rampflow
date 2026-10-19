import { zodResolver } from '@hookform/resolvers/zod';
import type { ResourceView } from '@rampflow/shared/modules/booking/api.capacity';
import {
  CreateDock,
  CreateHall,
  DOCK_STATUSES,
  DOOR_TYPES,
  type DockView,
  type HallView,
  TEMPERATURE_ZONES,
} from '@rampflow/shared/modules/core/api.sites';
import { useMutation } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, WrenchIcon } from 'lucide-react';
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
import { BookedAsLabel, BookedAsSelect } from './booked-as';
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
                  className={cn(d.status === 'inactive' && 'text-muted-foreground')}
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
                      {d.status === 'maintenance' ? <WrenchIcon aria-hidden /> : null}
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

/** Creates a dock in a hall, or edits one (MD-02). */
export function DockDialog({
  orgId,
  siteId,
  halls,
  edit,
  onOpenChange,
}: {
  orgId: string;
  siteId: string;
  halls: HallView[];
  edit: DockEdit | null;
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
          doorType: 'dock_leveler',
          temperatureZone: 'ambient',
          adrAllowed: false,
          status: 'active',
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
  const select = (
    name: 'hallId' | 'doorType' | 'temperatureZone' | 'status',
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
                DOOR_TYPES.map((v) => ({ value: v, label: t(($) => $.sites.door_types[v]) })),
              )}
              {select(
                'temperatureZone',
                t(($) => $.sites.docks.fields.zone),
                TEMPERATURE_ZONES.map((v) => ({ value: v, label: t(($) => $.sites.zones[v]) })),
              )}
              {select(
                'status',
                t(($) => $.sites.docks.fields.status),
                DOCK_STATUSES.map((v) => ({ value: v, label: t(($) => $.sites.statuses[v]) })),
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
