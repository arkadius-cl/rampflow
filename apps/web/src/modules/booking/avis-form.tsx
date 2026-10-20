import type { SettingKey, SettingValue } from '@rampflow/shared';
import {
  type Avis,
  AvisInput,
  type AvisRules,
  type AvisView,
} from '@rampflow/shared/modules/avis/avis';
import {
  AdrClass,
  LoadUnitType,
  PackingGroup,
  ReferenceType,
  VehicleType,
} from '@rampflow/shared/modules/avis/values';
import type { PutAvis } from '@rampflow/shared/modules/booking/api.staff';
import { Direction } from '@rampflow/shared/modules/booking/values';
import {
  DisplayNamesType,
  DriverLocale,
  ErrorCode,
  Setting,
  values,
  YesNo,
} from '@rampflow/shared/values';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useId } from 'react';
import {
  Controller,
  type FieldErrors,
  type FieldPath,
  type FieldPathByValue,
  type FieldError as FormFieldError,
  type Resolver,
  type UseFormReturn,
  useFieldArray,
  useWatch,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useAccess } from '@/lib/access';
import { ApiFailure } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// The avis fields of AV-01 for the staff booking sheet and the booking detail page. The form
// holds what inputs hold (strings); `toAvisInput` turns it into the API's AvisInput, and the
// resolver validates with the shared zod schema, so form paths equal API paths below `avis`.

export interface AvisFormValues {
  references: { type: ReferenceType; value: string }[];
  counterpartyName: string;
  loadUnits: { type: LoadUnitType; quantity: string; label: string; stackable?: boolean }[];
  palletPositions: string;
  grossWeightKg: string;
  palletExchange: YesNo | '';
  vehicle: { type: VehicleType | ''; plate: string; plateCountry: string; trailerPlate: string };
  driver: { name: string; phone: string; locale: DriverLocale | '' };
  dangerousGoods: {
    present: boolean;
    items: {
      unNumber: string;
      adrClass: AdrClass | '';
      packingGroup: PackingGroup | '';
      quantity?: number;
      unit?: 'kg' | 'l';
      limitedQuantity?: boolean;
    }[];
  };
  temperature: { controlled: boolean; minC: string; maxC: string };
  notes: string;
}

const text = (v: string | number | null | undefined) =>
  v === null || v === undefined ? '' : String(v);
const orNull = (v: string) => (v.trim() === '' ? null : v);
const numberOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const numberOrUndefined = (v: string) =>
  v.trim() === '' ? undefined : Number(v.replace(',', '.'));

const emptyDangerousGoodsItem = (): AvisFormValues['dangerousGoods']['items'][number] => ({
  unNumber: '',
  adrClass: '',
  packingGroup: '',
});

export function emptyAvis(): AvisFormValues {
  return {
    references: [{ type: ReferenceType.purchase_order, value: '' }],
    counterpartyName: '',
    loadUnits: [{ type: LoadUnitType.eur_pallet, quantity: '', label: '' }],
    palletPositions: '',
    grossWeightKg: '',
    palletExchange: '',
    vehicle: { type: '', plate: '', plateCountry: '', trailerPlate: '' },
    driver: { name: '', phone: '', locale: '' },
    dangerousGoods: { present: false, items: [emptyDangerousGoodsItem()] },
    temperature: { controlled: false, minC: '', maxC: '' },
    notes: '',
  };
}

/** The stored avis as form values; `null` (a turned-away walk-in) starts empty. */
export function avisFormValues(avis: AvisView | null): AvisFormValues {
  if (!avis) return emptyAvis();
  return {
    references: avis.references.map((r) => ({ ...r })),
    counterpartyName: avis.counterpartyName,
    loadUnits: avis.loadUnits.map((u) => ({
      type: u.type,
      quantity: String(u.quantity),
      label: text(u.label),
      ...(u.stackable === undefined ? {} : { stackable: u.stackable }),
    })),
    palletPositions: text(avis.palletPositions),
    grossWeightKg: text(avis.grossWeightKg),
    palletExchange: avis.palletExchange === null ? '' : avis.palletExchange ? YesNo.yes : YesNo.no,
    vehicle: {
      type: avis.vehicle.type ?? '',
      plate: text(avis.vehicle.plate),
      plateCountry: text(avis.vehicle.plateCountry),
      trailerPlate: text(avis.vehicle.trailerPlate),
    },
    driver: {
      name: text(avis.driver.name),
      phone: text(avis.driver.phone),
      locale: avis.driver.locale ?? '',
    },
    dangerousGoods: avis.dangerousGoods.present
      ? {
          present: true,
          items: avis.dangerousGoods.items.map((i) => ({
            ...i,
            packingGroup: i.packingGroup ?? '',
          })),
        }
      : { present: false, items: [emptyDangerousGoodsItem()] },
    temperature: avis.temperature.controlled
      ? { controlled: true, minC: text(avis.temperature.minC), maxC: text(avis.temperature.maxC) }
      : { controlled: false, minC: '', maxC: '' },
    notes: text(avis.notes),
  };
}

/** The API body of the form. Empty optional inputs become `null` or are left out. */
export function toAvisInput(v: AvisFormValues): AvisInput {
  return {
    references: v.references,
    counterpartyName: v.counterpartyName,
    loadUnits: v.loadUnits.map((u) => ({
      type: u.type,
      quantity: Number(u.quantity),
      ...(u.label.trim() === '' ? {} : { label: u.label }),
      ...(u.stackable === undefined ? {} : { stackable: u.stackable }),
    })),
    palletPositions: numberOrNull(v.palletPositions),
    grossWeightKg: numberOrNull(v.grossWeightKg),
    palletExchange: v.palletExchange === '' ? null : v.palletExchange === YesNo.yes,
    vehicle: {
      type: v.vehicle.type === '' ? null : v.vehicle.type,
      plate: orNull(v.vehicle.plate),
      plateCountry: orNull(v.vehicle.plateCountry.toUpperCase()),
      trailerPlate: orNull(v.vehicle.trailerPlate),
    },
    driver: {
      name: orNull(v.driver.name),
      phone: orNull(v.driver.phone),
      locale: v.driver.locale === '' ? null : v.driver.locale,
    },
    dangerousGoods: v.dangerousGoods.present
      ? {
          present: true,
          items: v.dangerousGoods.items.map((i) => ({
            unNumber: i.unNumber,
            // An unchosen class ('') fails the schema and shows under the field.
            adrClass: i.adrClass as AdrClass,
            ...(i.packingGroup === '' ? {} : { packingGroup: i.packingGroup }),
            ...(i.quantity === undefined ? {} : { quantity: i.quantity }),
            ...(i.unit === undefined ? {} : { unit: i.unit }),
            ...(i.limitedQuantity === undefined ? {} : { limitedQuantity: i.limitedQuantity }),
          })),
        }
      : { present: false },
    temperature: v.temperature.controlled
      ? {
          controlled: true,
          minC: numberOrUndefined(v.temperature.minC),
          maxC: numberOrUndefined(v.temperature.maxC),
        }
      : { controlled: false },
    notes: orNull(v.notes),
  };
}

const ARRAY_FIELDS = new Set(['references', 'loadUnits', 'items']);

/** The form path of an issue path below the avis: array-level issues go to `<array>.root`. */
export function avisErrorPath(path: readonly PropertyKey[]): string {
  const keys = path.map(String);
  const last = keys.at(-1);
  return last !== undefined && ARRAY_FIELDS.has(last)
    ? [...keys, 'root'].join('.')
    : keys.join('.');
}

function nest(flat: Record<string, FormFieldError>): FieldErrors<AvisFormValues> {
  const root: Record<string, unknown> = {};
  for (const [path, error] of Object.entries(flat)) {
    const keys = path.split('.');
    let node = root;
    for (const key of keys.slice(0, -1)) {
      node[key] ??= {};
      node = node[key] as Record<string, unknown>;
    }
    node[keys.at(-1) as string] ??= error;
  }
  return root as FieldErrors<AvisFormValues>;
}

/** Validates the form with the shared AvisInput schema; issue codes become the error types. */
export const avisResolver: Resolver<AvisFormValues, unknown, Avis> = async (values) => {
  const parsed = AvisInput.safeParse(toAvisInput(values));
  if (parsed.success) return { values: parsed.data, errors: {} };
  const flat: Record<string, FormFieldError> = {};
  for (const issue of parsed.error.issues) {
    flat[avisErrorPath(issue.path)] ??= { type: issue.code, message: issue.message };
  }
  return { values: {}, errors: nest(flat) };
};

/** Where the avis sits in a request body, and so in the paths of its 422 issues. */
const AVIS_KEY = 'avis' satisfies keyof PutAvis;

/**
 * Puts the 422 issues under `avis` of an API answer on the avis form's fields (AV-01). Returns
 * whether there were any.
 */
export function applyAvisIssues(
  error: unknown,
  form: UseFormReturn<AvisFormValues, unknown, Avis>,
) {
  if (!(error instanceof ApiFailure) || error.code !== ErrorCode.validation_failed) return false;
  const avisIssues = error.issues.filter((i) => i.path[0] === AVIS_KEY);
  for (const issue of avisIssues) {
    form.setError(avisErrorPath(issue.path.slice(1)) as FieldPath<AvisFormValues>, {
      type: issue.code,
      message: issue.message,
    });
  }
  return avisIssues.length > 0;
}

/** Fields whose too-small number means "must be positive". */
const POSITIVE_FIELDS = new Set(['quantity', 'grossWeightKg']);
/** A choice, whose invalid type means no answer rather than a wrong number. */
const CHOICE_FIELDS = new Set(['adrClass']);

type IssueType = string | number | undefined;

/** The message of a field error in the UI language, by issue code and field. */
export function useAvisMessage() {
  const { t } = useTranslation('booking');
  const { t: tAvis } = useTranslation('avis');
  const plate = (type: IssueType) =>
    type === 'invalid_format' ? t(($) => $.plan.validation.plate) : undefined;
  // A field's own message, which wins over the messages every field shares.
  const own = new Map<string, (type: IssueType) => string | undefined>([
    ['plate', plate],
    ['trailerPlate', plate],
    ['phone', (type) => (type === 'invalid_format' ? tAvis(($) => $.avis.hint.phone) : undefined)],
    [
      'unNumber',
      (type) => (type === 'invalid_format' ? tAvis(($) => $.avis.hint.unNumber) : undefined),
    ],
    ['plateCountry', () => t(($) => $.plan.validation.country)],
    ['label', () => tAvis(($) => $.avis.hint.otherLabel)],
    [
      'maxC',
      (type) => (type === 'custom' ? t(($) => $.plan.validation.temperature_order) : undefined),
    ],
    [
      'references',
      (type) => (type === 'custom' ? t(($) => $.plan.validation.reference_type) : undefined),
    ],
  ]);
  return (error: { type?: string | number } | undefined, field: string): string | undefined => {
    if (!error) return undefined;
    const specific = own.get(field)?.(error.type);
    if (specific) return specific;
    if (error.type === 'custom') return t(($) => $.plan.validation.required_here);
    if (error.type === 'too_big') return t(($) => $.plan.validation.too_big);
    if (error.type === 'too_small' && POSITIVE_FIELDS.has(field))
      return t(($) => $.plan.validation.positive);
    if (error.type === 'invalid_type' && !CHOICE_FIELDS.has(field))
      return t(($) => $.plan.validation.number);
    return t(($) => $.plan.validation.required);
  };
}

export function AvisFields({
  form,
  direction,
  rules,
  disabled,
}: {
  form: UseFormReturn<AvisFormValues, unknown, Avis>;
  direction: Direction;
  /** Which fields the site requires on top of the schema (AV-01 settings). */
  rules: AvisRules;
  disabled?: boolean;
}) {
  const { t } = useTranslation('booking');
  const { t: tAvis } = useTranslation('avis');
  const message = useAvisMessage();
  const id = useId();
  const locale = useLocale();
  const languageName = new Intl.DisplayNames([locale], { type: DisplayNamesType.language });
  const regionName = new Intl.DisplayNames([locale], { type: DisplayNamesType.region });
  const control = form.control;
  const references = useFieldArray({ control, name: 'references' });
  const loadUnits = useFieldArray({ control, name: 'loadUnits' });
  const dgItems = useFieldArray({ control, name: 'dangerousGoods.items' });
  const unitRows = useWatch({ control, name: 'loadUnits' });
  const dgPresent = useWatch({ control, name: 'dangerousGoods.present' });
  const tempControlled = useWatch({ control, name: 'temperature.controlled' });
  const total = unitRows.reduce((sum, u) => sum + (Number(u.quantity) || 0), 0);
  const requiredHere = t(($) => $.plan.avis.required_here);
  const errors = form.formState.errors;

  const textField = (
    name: FieldPathByValue<AvisFormValues, string>,
    label: string,
    o: {
      description?: string;
      mono?: boolean;
      inputMode?: 'decimal' | 'numeric' | 'tel';
      className?: string;
    } = {},
  ) => (
    <Controller
      key={name}
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={o.className}>
          <FieldLabel htmlFor={`${id}-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            id={`${id}-${name}`}
            disabled={disabled}
            inputMode={o.inputMode}
            autoComplete="off"
            className={cn(o.mono && 'font-mono')}
            aria-invalid={fieldState.invalid}
          />
          {o.description ? <FieldDescription>{o.description}</FieldDescription> : null}
          <FieldError>{message(fieldState.error, name.split('.').at(-1) ?? name)}</FieldError>
        </Field>
      )}
    />
  );

  return (
    <FieldGroup className="gap-5">
      <FieldSet>
        <FieldLegend variant="label">{tAvis(($) => $.avis.field.references)}</FieldLegend>
        {rules.requiredReferenceTypes.length > 0 ? (
          <FieldDescription>
            {t(($) => $.plan.avis.required_types, {
              types: rules.requiredReferenceTypes
                .map((type) => tAvis(($) => $.avis.referenceType[type]))
                .join(', '),
            })}
          </FieldDescription>
        ) : null}
        <div className="flex flex-col gap-2">
          {references.fields.map((row, i) => (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-start gap-2"
            >
              <Controller
                name={`references.${i}.type`}
                control={control}
                render={({ field }) => (
                  <NativeSelect
                    {...field}
                    className="w-full"
                    disabled={disabled}
                    aria-label={t(($) => $.plan.avis.reference_type, { n: i + 1 })}
                  >
                    {values(ReferenceType).map((type) => (
                      <NativeSelectOption key={type} value={type}>
                        {tAvis(($) => $.avis.referenceType[type])}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              />
              <Controller
                name={`references.${i}.value`}
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <Input
                      {...field}
                      disabled={disabled}
                      autoComplete="off"
                      aria-label={t(($) => $.plan.avis.reference_value, { n: i + 1 })}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError>{message(fieldState.error, 'value')}</FieldError>
                  </Field>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || references.fields.length === 1}
                aria-label={t(($) => $.plan.avis.remove_reference, { n: i + 1 })}
                onClick={() => references.remove(i)}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
        <FieldError>{message(errors.references?.root, 'references')}</FieldError>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={disabled || references.fields.length >= 20}
          onClick={() => references.append({ type: ReferenceType.delivery_note, value: '' })}
        >
          <PlusIcon />
          {t(($) => $.plan.avis.add_reference)}
        </Button>
      </FieldSet>

      {textField(
        'counterpartyName',
        direction === Direction.inbound
          ? tAvis(($) => $.avis.field.counterpartyInbound)
          : tAvis(($) => $.avis.field.counterpartyOutbound),
      )}

      <FieldSet>
        <FieldLegend variant="label">{tAvis(($) => $.avis.field.loadUnits)}</FieldLegend>
        <div className="flex flex-col gap-2">
          {loadUnits.fields.map((row, i) => (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(0,11rem)_6rem_minmax(0,1fr)_auto] items-start gap-2"
            >
              <Controller
                name={`loadUnits.${i}.type`}
                control={control}
                render={({ field }) => (
                  <NativeSelect
                    {...field}
                    className="w-full"
                    disabled={disabled}
                    aria-label={t(($) => $.plan.avis.unit_type, { n: i + 1 })}
                  >
                    {values(LoadUnitType).map((type) => (
                      <NativeSelectOption key={type} value={type}>
                        {tAvis(($) => $.avis.loadUnitType[type])}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              />
              <Controller
                name={`loadUnits.${i}.quantity`}
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <Input
                      {...field}
                      disabled={disabled}
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={t(($) => $.plan.avis.unit_quantity, { n: i + 1 })}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError>{message(fieldState.error, 'quantity')}</FieldError>
                  </Field>
                )}
              />
              {unitRows[i]?.type === LoadUnitType.other ? (
                <Controller
                  name={`loadUnits.${i}.label`}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <Input
                        {...field}
                        disabled={disabled}
                        autoComplete="off"
                        placeholder={tAvis(($) => $.avis.hint.otherLabel)}
                        aria-label={t(($) => $.plan.avis.unit_label, { n: i + 1 })}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldError>{message(fieldState.error, 'label')}</FieldError>
                    </Field>
                  )}
                />
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || loadUnits.fields.length === 1}
                aria-label={t(($) => $.plan.avis.remove_unit, { n: i + 1 })}
                onClick={() => loadUnits.remove(i)}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
        <FieldDescription>{t(($) => $.plan.avis.total_units, { n: total })}</FieldDescription>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={disabled || loadUnits.fields.length >= 20}
          onClick={() =>
            loadUnits.append({ type: LoadUnitType.eur_pallet, quantity: '', label: '' })
          }
        >
          <PlusIcon />
          {t(($) => $.plan.avis.add_unit)}
        </Button>
      </FieldSet>

      <div className="grid gap-4 sm:grid-cols-3">
        {textField(
          'grossWeightKg',
          tAvis(($) => $.avis.field.grossWeightKg),
          {
            inputMode: 'decimal',
            description: rules.requireGrossWeight ? requiredHere : undefined,
          },
        )}
        {textField(
          'palletPositions',
          tAvis(($) => $.avis.field.palletPositions),
          {
            inputMode: 'numeric',
          },
        )}
        <Controller
          name="palletExchange"
          control={control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={`${id}-palletExchange`}>
                {tAvis(($) => $.avis.field.palletExchange)}
              </FieldLabel>
              <NativeSelect
                {...field}
                id={`${id}-palletExchange`}
                className="w-full"
                disabled={disabled}
              >
                <NativeSelectOption value="">{t(($) => $.plan.avis.unknown)}</NativeSelectOption>
                <NativeSelectOption value="yes">{t(($) => $.plan.avis.yes)}</NativeSelectOption>
                <NativeSelectOption value="no">{t(($) => $.plan.avis.no)}</NativeSelectOption>
              </NativeSelect>
            </Field>
          )}
        />
      </div>

      <FieldSet>
        <FieldLegend variant="label">{t(($) => $.plan.avis.vehicle)}</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="vehicle.type"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor={`${id}-vehicle-type`}>
                  {tAvis(($) => $.avis.field.vehicleType)}
                </FieldLabel>
                <NativeSelect
                  {...field}
                  id={`${id}-vehicle-type`}
                  className="w-full"
                  disabled={disabled}
                >
                  <NativeSelectOption value="">{t(($) => $.plan.avis.unknown)}</NativeSelectOption>
                  {values(VehicleType).map((type) => (
                    <NativeSelectOption key={type} value={type}>
                      {tAvis(($) => $.avis.vehicleType[type])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          />
          {textField(
            'vehicle.plate',
            tAvis(($) => $.avis.field.plate),
            {
              mono: true,
              description: rules.requirePlate ? requiredHere : tAvis(($) => $.avis.hint.plate),
            },
          )}
          {textField(
            'vehicle.plateCountry',
            tAvis(($) => $.avis.field.plateCountry),
            {
              description: t(($) => $.plan.avis.country_hint, {
                example: regionName.of('PL') ?? 'PL',
              }),
            },
          )}
          {textField(
            'vehicle.trailerPlate',
            tAvis(($) => $.avis.field.trailerPlate),
            { mono: true },
          )}
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">{t(($) => $.plan.avis.driver)}</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-3">
          {textField(
            'driver.name',
            tAvis(($) => $.avis.field.driverName),
          )}
          {textField(
            'driver.phone',
            tAvis(($) => $.avis.field.driverPhone),
            {
              inputMode: 'tel',
              description: rules.requireDriverPhone
                ? requiredHere
                : tAvis(($) => $.avis.hint.phone),
            },
          )}
          <Controller
            name="driver.locale"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor={`${id}-driver-locale`}>
                  {tAvis(($) => $.avis.field.driverLocale)}
                </FieldLabel>
                <NativeSelect
                  {...field}
                  id={`${id}-driver-locale`}
                  className="w-full"
                  disabled={disabled}
                >
                  <NativeSelectOption value="">{t(($) => $.plan.avis.unknown)}</NativeSelectOption>
                  {values(DriverLocale).map((code) => (
                    <NativeSelectOption key={code} value={code}>
                      {languageName.of(code) ?? code}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          />
        </div>
      </FieldSet>

      <FieldSet>
        <Controller
          name="dangerousGoods.present"
          control={control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-dg`}
                checked={field.value}
                disabled={disabled}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <FieldLabel htmlFor={`${id}-dg`} className="font-normal">
                {tAvis(($) => $.avis.field.dangerousGoods)}
              </FieldLabel>
            </Field>
          )}
        />
        {dgPresent ? (
          <div className="flex flex-col gap-2">
            {dgItems.fields.map((row, i) => (
              <div
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_7rem_6rem_auto] items-start gap-2"
              >
                {textField(
                  `dangerousGoods.items.${i}.unNumber`,
                  tAvis(($) => $.avis.field.unNumber),
                  {
                    mono: true,
                  },
                )}
                <Controller
                  name={`dangerousGoods.items.${i}.adrClass`}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-dg-${i}-class`}>
                        {tAvis(($) => $.avis.field.adrClass)}
                      </FieldLabel>
                      <NativeSelect
                        {...field}
                        id={`${id}-dg-${i}-class`}
                        className="w-full"
                        disabled={disabled}
                        aria-invalid={fieldState.invalid}
                      >
                        <NativeSelectOption value="" />
                        {values(AdrClass).map((c) => (
                          <NativeSelectOption key={c} value={c}>
                            {c}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <FieldError>{message(fieldState.error, 'adrClass')}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  name={`dangerousGoods.items.${i}.packingGroup`}
                  control={control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor={`${id}-dg-${i}-pg`}>
                        {tAvis(($) => $.avis.field.packingGroup)}
                      </FieldLabel>
                      <NativeSelect
                        {...field}
                        id={`${id}-dg-${i}-pg`}
                        className="w-full"
                        disabled={disabled}
                      >
                        <NativeSelectOption value="" />
                        {values(PackingGroup).map((g) => (
                          <NativeSelectOption key={g} value={g}>
                            {g}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6"
                  disabled={disabled || dgItems.fields.length === 1}
                  aria-label={t(($) => $.plan.avis.remove_dangerous_goods, { n: i + 1 })}
                  onClick={() => dgItems.remove(i)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <FieldDescription>{tAvis(($) => $.avis.hint.unNumber)}</FieldDescription>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={disabled || dgItems.fields.length >= 20}
              onClick={() => dgItems.append(emptyDangerousGoodsItem())}
            >
              <PlusIcon />
              {t(($) => $.plan.avis.add_dangerous_goods)}
            </Button>
          </div>
        ) : null}
      </FieldSet>

      <FieldSet>
        <Controller
          name="temperature.controlled"
          control={control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-temp`}
                checked={field.value}
                disabled={disabled}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <FieldLabel htmlFor={`${id}-temp`} className="font-normal">
                {tAvis(($) => $.avis.field.temperature)}
              </FieldLabel>
            </Field>
          )}
        />
        {tempControlled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {textField(
              'temperature.minC',
              tAvis(($) => $.avis.field.minC),
              { inputMode: 'decimal' },
            )}
            {textField(
              'temperature.maxC',
              tAvis(($) => $.avis.field.maxC),
              { inputMode: 'decimal' },
            )}
          </div>
        ) : null}
      </FieldSet>

      <Controller
        name="notes"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-notes`}>{tAvis(($) => $.avis.field.notes)}</FieldLabel>
            <Textarea
              {...field}
              id={`${id}-notes`}
              disabled={disabled}
              rows={2}
              aria-invalid={fieldState.invalid}
            />
            <FieldError>{message(fieldState.error, 'notes')}</FieldError>
          </Field>
        )}
      />
    </FieldGroup>
  );
}

/** The avis settings of a site from the tenant context; a hidden setting requires nothing. */
export function useAvisRules(siteId: string): AvisRules {
  const access = useAccess();
  const read = <K extends SettingKey>(key: K, fallback: SettingValue<K>): SettingValue<K> => {
    try {
      return access.setting(key, siteId);
    } catch {
      return fallback;
    }
  };
  return {
    requiredReferenceTypes: read(Setting.avis.required_reference_types, []),
    requireGrossWeight: read(Setting.avis.require_gross_weight, false),
    requireDriverPhone: read(Setting.avis.require_driver_phone, false),
    requirePlate: read(Setting.booking.require_plate, false),
  };
}
