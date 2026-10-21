import type { SettingKey } from '@rampflow/shared';
import { SettingControl } from '@rampflow/shared/modules/core/values';
import { DisplayNamesType, Setting, type SettingUnit, ZodIssueCode } from '@rampflow/shared/values';
import { XIcon } from 'lucide-react';
import type { FieldError as FormFieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { GroupedChecklist } from '@/components/grouped-checklist';
import { Checkbox } from '@/components/ui/checkbox';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/lib/i18n';
import { useFormat } from './format';
import type { ControlSpec } from './setting-control';

// The input of one settings field, chosen by its `ControlSpec` (TN-02, PL-03).

/** The DOM ids of a field: the title is the anchor, the rest wire label and descriptions. */
export const fieldIds = (key: SettingKey) => ({
  title: key,
  input: `input-${key}`,
  description: `description-${key}`,
  unit: `unit-${key}`,
  error: `error-${key}`,
});

export interface SettingInputProps {
  settingKey: SettingKey;
  spec: ControlSpec;
  unit?: SettingUnit;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
  /** Takes the element react-hook-form focuses when the field is the first invalid one. */
  inputRef?: (element: HTMLElement | null) => void;
}

export function SettingInput({
  settingKey,
  spec,
  unit,
  value,
  onChange,
  invalid,
  inputRef,
}: SettingInputProps) {
  const { t } = useTranslation();
  const display = useValueText(settingKey, spec);
  const ids = fieldIds(settingKey);
  const describedBy = invalid ? `${ids.description} ${ids.error}` : ids.description;
  switch (spec.kind) {
    case SettingControl.switch:
      return (
        <div className="flex h-8 items-center gap-2 text-sm">
          <Switch
            ref={inputRef}
            id={ids.input}
            aria-describedby={describedBy}
            checked={value === true}
            onCheckedChange={(on) => onChange(on)}
          />
          <span aria-hidden>{display(value)}</span>
        </div>
      );
    case SettingControl.select:
      return (
        <NativeSelect
          ref={inputRef}
          id={ids.input}
          aria-describedby={describedBy}
          className="w-full"
          value={String(value)}
          aria-invalid={invalid}
          onChange={(e) => {
            const picked = spec.options.find((o) => String(o) === e.target.value);
            onChange(picked ?? e.target.value);
          }}
        >
          {spec.options.map((o) => (
            <NativeSelectOption key={String(o)} value={String(o)}>
              {display(o)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    case SettingControl.number:
      return (
        <InputGroup className="w-40">
          <InputGroupInput
            ref={inputRef}
            id={ids.input}
            aria-describedby={unit ? `${describedBy} ${ids.unit}` : describedBy}
            type="number"
            inputMode="numeric"
            min={spec.min}
            max={spec.max}
            step={1}
            className="tabular-nums"
            aria-invalid={invalid}
            value={typeof value === 'number' && !Number.isNaN(value) ? String(value) : ''}
            onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
          />
          {unit ? (
            <InputGroupAddon id={ids.unit} align="inline-end">
              <span aria-hidden>{t(($) => $['settings-ui'].units[unit])}</span>
              <span className="sr-only">{t(($) => $['settings-ui'].unit_names[unit])}</span>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      );
    case SettingControl.list: {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset
          ref={inputRef}
          id={ids.input}
          tabIndex={-1}
          aria-labelledby={ids.title}
          aria-describedby={describedBy}
          className="flex flex-col gap-1.5"
        >
          {spec.options.map((o) => (
            <div key={o} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${ids.input}-${o}`}
                checked={picked.includes(o)}
                onCheckedChange={(on) =>
                  onChange(spec.options.filter((x) => (x === o ? on : picked.includes(x))))
                }
              />
              <label htmlFor={`${ids.input}-${o}`}>{display([o])}</label>
            </div>
          ))}
        </fieldset>
      );
    }
    case SettingControl.grouped_list:
      return (
        <GroupedChecklist
          ref={inputRef}
          id={ids.input}
          labelledBy={ids.title}
          describedBy={describedBy}
          groups={spec.groups.map((g) => ({
            ...g,
            label: t(`settings-ui.countries.groups.${g.id}` as never) as string,
          }))}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          name={(o) => display([o])}
          invalid={invalid}
        />
      );
    case SettingControl.url:
      return (
        <InputGroup>
          <InputGroupInput
            ref={inputRef}
            id={ids.input}
            aria-describedby={describedBy}
            type="url"
            placeholder="https://"
            aria-invalid={invalid}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value.trim() === '' ? null : e.target.value.trim())}
          />
          {typeof value === 'string' && value !== '' ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={t(($) => $['settings-ui'].clear)}
                onClick={() => onChange(null)}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      );
  }
}

/** A setting value as text: the inherited hint, select options and the switch label. */
export function useValueText(key: SettingKey, spec: ControlSpec) {
  const { t } = useTranslation();
  const locale = useLocale();
  const format = useFormat();
  const languages = new Intl.DisplayNames(locale, { type: DisplayNamesType.language });
  const regions = new Intl.DisplayNames(locale, { type: DisplayNamesType.region });
  const option = (v: unknown): string => {
    if (key === Setting.i18n.default_locale) return languages.of(String(v)) ?? String(v);
    if (key === Setting.core.site_countries) return regions.of(String(v)) ?? String(v);
    if (key === Setting.booking.public_registration_mode) {
      return t(`settings-ui.values.public_registration_mode.${String(v)}` as never) as string;
    }
    if (key === Setting.avis.required_reference_types) {
      return t(`settings-ui.values.reference_type.${String(v)}` as never) as string;
    }
    return typeof v === 'number' ? format.number(v) : String(v);
  };
  return (value: unknown): string => {
    switch (spec.kind) {
      case SettingControl.switch:
        return value ? t(($) => $['settings-ui'].values.on) : t(($) => $['settings-ui'].values.off);
      case SettingControl.list:
      case SettingControl.grouped_list: {
        const list = Array.isArray(value) ? value : [];
        return list.length === 0
          ? t(($) => $['settings-ui'].values.none)
          : list.map(option).join(', ');
      }
      case SettingControl.url:
        return typeof value === 'string' ? value : t(($) => $['settings-ui'].values.none);
      default:
        return option(value);
    }
  };
}

/** A field error by zod issue code, with the range of number fields. */
export function useSettingMessage(spec: ControlSpec) {
  const { t } = useTranslation();
  const format = useFormat();
  return (error: FormFieldError | undefined): string | undefined => {
    if (!error) return undefined;
    if (spec.kind === SettingControl.number) {
      return t(($) => $['settings-ui'].validation.number_range, {
        min: format.number(spec.min),
        max: format.number(spec.max),
      });
    }
    if (spec.kind === SettingControl.url) return t(($) => $['settings-ui'].validation.url);
    if (spec.kind === SettingControl.list && error.type === ZodIssueCode.custom) {
      return t(($) => $['settings-ui'].validation.duplicate);
    }
    if (spec.kind === SettingControl.grouped_list && error.type === ZodIssueCode.too_small) {
      return t(($) => $['settings-ui'].validation.at_least_one_country);
    }
    return t(($) => $['settings-ui'].validation.invalid);
  };
}
