import { zodResolver } from '@hookform/resolvers/zod';
import { LOAD_UNIT_TYPES, phoneSchema, plateSchema } from '@rampflow/shared/modules/avis/avis';
import { REFERENCE_TYPES } from '@rampflow/shared/modules/avis/manifest';
import { TURN_AWAY_REASONS } from '@rampflow/shared/modules/booking/lifecycle';
import type { WalkInBody } from '@rampflow/shared/modules/yard/api';
import { useQuery } from '@tanstack/react-query';
import { LogInIcon, OctagonXIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, type Path, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';
import { useFieldMessage } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ApiFailure } from '@/lib/api';
import { randomId } from '@/lib/utils';
import { loadTypesQuery, useYardMutation, yardApi } from './queries';
import { useLoadTypeName } from './truck-parts';

// YD-03 with BK-02 "walk-in now": an unbooked truck gets a booking at the current grid slot and
// is checked in (or turned away) in one request. Gate operators enter the carrier by name.

const optional = (schema: z.ZodType) => z.union([z.literal(''), schema]);

const WalkInForm = z
  .object({
    outcome: z.enum(['check_in', 'turn_away']),
    carrierName: z.string().trim().min(1).max(120),
    loadTypeId: z.uuid(),
    plateSeen: plateSchema,
    reason: z.union([z.literal(''), z.enum(TURN_AWAY_REASONS)]),
    referenceType: z.enum(REFERENCE_TYPES),
    referenceValue: z.string().trim().max(35),
    counterpartyName: z.string().trim().max(120),
    loadUnitType: z.enum(LOAD_UNIT_TYPES),
    quantity: z.string().regex(/^\d{0,4}$/),
    driverName: z.string().trim().max(120),
    driverPhone: optional(phoneSchema),
  })
  .superRefine((f, ctx) => {
    const required = (path: Path<WalkInFormInput>) =>
      ctx.addIssue({ code: 'too_small', minimum: 1, origin: 'string', input: '', path: [path] });
    if (f.outcome === 'turn_away') {
      if (f.reason === '') required('reason');
      return;
    }
    if (f.referenceValue === '') required('referenceValue');
    if (f.counterpartyName === '') required('counterpartyName');
    if (!(Number(f.quantity) >= 1)) required('quantity');
  });
type WalkInFormInput = z.input<typeof WalkInForm>;
type WalkInFormOutput = z.output<typeof WalkInForm>;

function bodyOf(f: WalkInFormOutput, siteId: string, clientRequestId: string): WalkInBody {
  const base = {
    clientRequestId,
    siteId,
    loadTypeId: f.loadTypeId,
    carrier: { name: f.carrierName },
    plateSeen: f.plateSeen,
  };
  if (f.outcome === 'turn_away') {
    return { ...base, outcome: 'turn_away', reason: f.reason === '' ? 'other' : f.reason };
  }
  return {
    ...base,
    outcome: 'check_in',
    avis: {
      references: [{ type: f.referenceType, value: f.referenceValue }],
      counterpartyName: f.counterpartyName,
      loadUnits: [{ type: f.loadUnitType, quantity: Number(f.quantity) }],
      vehicle: { type: null, plate: f.plateSeen, plateCountry: null, trailerPlate: null },
      driver: {
        name: f.driverName === '' ? null : f.driverName,
        phone: f.driverPhone === '' ? null : String(f.driverPhone),
        locale: null,
      },
    },
  };
}

/** Server issue paths of the walk-in body, as form fields. */
const SERVER_FIELDS: Record<string, Path<WalkInFormInput>> = {
  plateSeen: 'plateSeen',
  loadTypeId: 'loadTypeId',
  carrier: 'carrierName',
  reason: 'reason',
  'avis.references': 'referenceValue',
  'avis.counterpartyName': 'counterpartyName',
  'avis.loadUnits': 'quantity',
  'avis.driver.name': 'driverName',
  'avis.driver.phone': 'driverPhone',
  'avis.vehicle.plate': 'plateSeen',
};

export function WalkInDialog({
  orgId,
  siteId,
  online,
  onDone,
}: {
  orgId: string;
  siteId: string;
  online: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation('yard');
  const { t: ta } = useTranslation('avis');
  const { t: tb } = useTranslation('booking');
  const message = useFieldMessage();
  const loadTypeName = useLoadTypeName();
  const loadTypes = (useQuery(loadTypesQuery(orgId, siteId)).data?.items ?? []).filter(
    (l) => l.active,
  );
  const [safetyMissing, setSafetyMissing] = useState(false);
  // One id per dialog: a retry after a lost answer returns the first walk-in, not a second.
  const [requestId] = useState(() => randomId());
  const form = useForm<WalkInFormInput, unknown, WalkInFormOutput>({
    resolver: zodResolver(WalkInForm),
    defaultValues: {
      outcome: 'check_in',
      carrierName: '',
      loadTypeId: '',
      plateSeen: '',
      reason: '',
      referenceType: 'delivery_note',
      referenceValue: '',
      counterpartyName: '',
      loadUnitType: 'eur_pallet',
      quantity: '',
      driverName: '',
      driverPhone: '',
    },
  });
  const walkIn = useYardMutation(orgId, (body: WalkInBody) => yardApi(orgId).walkIn(body), {
    onSuccess: (result, body) => {
      toast.success(
        t(($) => $.gate.walk_in.done, { carrier: 'name' in body.carrier ? body.carrier.name : '' }),
      );
      if (result.safety === 'missing') setSafetyMissing(true);
      else onDone();
    },
    onError: (e) => {
      if (!(e instanceof ApiFailure) || e.code !== 'validation_failed') return;
      for (const issue of e.issues) {
        const key = Object.keys(SERVER_FIELDS).find((k) => issue.path.join('.').startsWith(k));
        if (key) form.setError(SERVER_FIELDS[key] as Path<WalkInFormInput>, { type: issue.code });
      }
    },
  });
  const submit = (outcome: 'check_in' | 'turn_away') => {
    form.setValue('outcome', outcome);
    void form.handleSubmit((f) => walkIn.mutate(bodyOf(f, siteId, requestId)))();
  };

  const text = (
    name: Path<WalkInFormInput>,
    label: string,
    o: { mono?: boolean; type?: string } = {},
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`walk-in-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            value={String(field.value ?? '')}
            id={`walk-in-${name}`}
            type={o.type ?? 'text'}
            autoComplete="off"
            className={o.mono ? 'h-12 font-mono uppercase' : 'h-12'}
            aria-invalid={fieldState.invalid}
          />
          <FieldError>{message(fieldState.error)}</FieldError>
        </Field>
      )}
    />
  );
  const select = (
    name: Path<WalkInFormInput>,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`walk-in-${name}`}>{label}</FieldLabel>
          <NativeSelect
            {...field}
            value={String(field.value ?? '')}
            id={`walk-in-${name}`}
            className="h-12"
            aria-invalid={fieldState.invalid}
          >
            {options.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError>
            {name === 'loadTypeId' && fieldState.error?.type === 'custom'
              ? t(($) => $.gate.walk_in.load_type_unavailable)
              : message(fieldState.error)}
          </FieldError>
        </Field>
      )}
    />
  );
  const choose = { value: '', label: t(($) => $.gate.walk_in.choose) };

  return (
    <DialogContent
      className="max-h-[95svh] overflow-y-auto sm:max-w-3xl"
      data-density="touch"
      showCloseButton={false}
    >
      <DialogHeader>
        <DialogTitle className="text-xl">{t(($) => $.gate.walk_in.title)}</DialogTitle>
        <DialogDescription>{t(($) => $.gate.walk_in.description)}</DialogDescription>
      </DialogHeader>
      {safetyMissing ? (
        <p
          role="status"
          className="rounded-md border border-tone-danger-border bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger"
        >
          {t(($) => $.gate.walk_in.safety_missing)}
        </p>
      ) : (
        <form noValidate onSubmit={(e) => e.preventDefault()}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {text(
              'carrierName',
              t(($) => $.gate.walk_in.carrier),
            )}
            {text(
              'plateSeen',
              ta(($) => $.avis.field.plateSeen),
              { mono: true },
            )}
            {select(
              'loadTypeId',
              t(($) => $.gate.walk_in.load_type),
              [choose, ...loadTypes.map((l) => ({ value: l.id, label: loadTypeName(l.name) }))],
            )}
            {text(
              'counterpartyName',
              ta(($) => $.avis.field.counterpartyName),
            )}
            {select(
              'referenceType',
              t(($) => $.gate.walk_in.reference_type),
              REFERENCE_TYPES.map((r) => ({ value: r, label: ta(($) => $.avis.referenceType[r]) })),
            )}
            {text(
              'referenceValue',
              ta(($) => $.avis.field.reference),
            )}
            {select(
              'loadUnitType',
              ta(($) => $.avis.field.loadUnits),
              LOAD_UNIT_TYPES.map((u) => ({ value: u, label: ta(($) => $.avis.loadUnitType[u]) })),
            )}
            {text(
              'quantity',
              ta(($) => $.avis.field.quantity),
              { type: 'number' },
            )}
            {text(
              'driverName',
              ta(($) => $.avis.field.driverName),
            )}
            {text(
              'driverPhone',
              ta(($) => $.avis.field.driverPhone),
              { type: 'tel' },
            )}
          </FieldGroup>
          <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border p-4">
            <div className="min-w-64 flex-1">
              {select(
                'reason',
                t(($) => $.gate.check_in.turn_away_title),
                [
                  { value: '', label: t(($) => $.gate.check_in.choose_reason) },
                  ...TURN_AWAY_REASONS.map((r) => ({
                    value: r,
                    label: tb(($) => $.lifecycle.turnAwayReason[r]),
                  })),
                ],
              )}
            </div>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="h-12"
              disabled={!online || walkIn.isPending}
              onClick={() => submit('turn_away')}
            >
              <OctagonXIcon /> {t(($) => $.gate.walk_in.turn_away)}
            </Button>
          </div>
        </form>
      )}
      <DialogFooter className="items-center">
        {!online ? (
          <span className="mr-auto text-sm text-tone-danger">{t(($) => $.gate.offline)}</span>
        ) : null}
        <Button variant="ghost" size="lg" onClick={onDone}>
          {t(($) => $.gate.check_in.cancel)}
        </Button>
        {safetyMissing ? null : (
          <Button
            size="lg"
            className="h-12 min-w-44"
            disabled={!online || walkIn.isPending}
            onClick={() => submit('check_in')}
          >
            <LogInIcon /> {t(($) => $.gate.walk_in.check_in_now)}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
