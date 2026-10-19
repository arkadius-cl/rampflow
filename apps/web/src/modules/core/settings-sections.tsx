import { zodResolver } from '@hookform/resolvers/zod';
import type { ModuleId, SettingKey, SettingScope } from '@rampflow/shared';
import type { SettingEntry } from '@rampflow/shared/modules/core/api.settings';
import { useMutation } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { Controller, type FieldError as FormFieldError, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
import { SettingField } from '@/components/settings-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/lib/i18n';
import { useFormat } from './format';
import { type ControlSpec, controlOf, settingDef } from './setting-control';

// The settings of one level (platform, tenant or site), one section per module, one form per
// field: each field saves and resets on its own (TN-02, PL-03).

export interface SettingsActions {
  save: (key: SettingKey, value: unknown) => Promise<unknown>;
  reset: (key: SettingKey) => Promise<unknown>;
}

export function SettingsSections({
  items,
  scope,
  actions,
}: {
  items: SettingEntry[];
  scope: SettingScope;
  actions: SettingsActions;
}) {
  const { t } = useTranslation();
  const sections = new Map<ModuleId, SettingEntry[]>();
  for (const item of items) sections.set(item.module, [...(sections.get(item.module) ?? []), item]);
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(($) => $['settings-ui'].empty)}</p>;
  }
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      {[...sections].map(([module, entries]) => (
        <section
          key={module}
          className="rounded-lg border bg-background"
          aria-labelledby={`section-${module}`}
        >
          <div className="border-b px-5 py-3">
            <h2 id={`section-${module}`} className="font-semibold">
              {t(`settings-ui.sections.${module}` as never) as string}
            </h2>
          </div>
          <div className="divide-y px-5">
            {entries.map((entry) => (
              <SettingRow key={entry.key} entry={entry} scope={scope} actions={actions} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const labelKey = (key: SettingKey, part: 'label' | 'description') => {
  const dot = key.indexOf('.');
  return `${key.slice(0, dot)}:settings.${key.slice(dot + 1)}.${part}`;
};

function SettingRow({
  entry,
  scope,
  actions,
}: {
  entry: SettingEntry;
  scope: SettingScope;
  actions: SettingsActions;
}) {
  const { t } = useTranslation();
  const def = settingDef(entry.key);
  const spec = controlOf(def.schema);
  const display = useValueText(entry.key, spec);
  const form = useForm<{ value: unknown }>({
    resolver: zodResolver(z.object({ value: def.schema })) as never,
    values: { value: entry.value },
  });
  const save = useMutation({
    mutationFn: (value: unknown) => actions.save(entry.key, value),
    onError: (e) => applyServerIssues(e, form.setError),
  });
  const reset = useMutation({ mutationFn: () => actions.reset(entry.key) });
  const label = t(labelKey(entry.key, 'label') as never) as string;
  const message = useSettingMessage(spec);

  return (
    <form noValidate onSubmit={form.handleSubmit(({ value }) => save.mutate(value))}>
      <SettingField
        id={entry.key}
        label={label}
        description={t(labelKey(entry.key, 'description') as never) as string}
        source={entry.source}
        scope={scope}
        inheritedValue={display(entry.inherited.value)}
        onReset={() => reset.mutate()}
        resetting={reset.isPending}
        control={
          <Controller
            name="value"
            control={form.control}
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Control
                      id={entry.key}
                      label={label}
                      spec={spec}
                      value={field.value}
                      onChange={field.onChange}
                      invalid={fieldState.invalid}
                      display={display}
                    />
                  </div>
                  {form.formState.isDirty ? (
                    <Button type="submit" size="sm" disabled={save.isPending}>
                      {save.isPending ? <Spinner /> : null}
                      {t(($) => $['settings-ui'].save)}
                    </Button>
                  ) : null}
                </div>
                <FieldError>{message(fieldState.error)}</FieldError>
              </div>
            )}
          />
        }
      />
    </form>
  );
}

function Control({
  id,
  label,
  spec,
  value,
  onChange,
  invalid,
  display,
}: {
  id: string;
  label: string;
  spec: ControlSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
  display: (value: unknown) => string;
}) {
  const { t } = useTranslation();
  switch (spec.kind) {
    case 'switch':
      return (
        <div className="flex h-8 items-center gap-2 text-sm">
          <Switch id={id} checked={value === true} onCheckedChange={(on) => onChange(on)} />
          <span aria-hidden>{display(value)}</span>
        </div>
      );
    case 'select':
      return (
        <NativeSelect
          id={id}
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
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={spec.min}
          max={spec.max}
          step={1}
          className="w-32 tabular-nums"
          aria-invalid={invalid}
          value={typeof value === 'number' && !Number.isNaN(value) ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
        />
      );
    case 'list': {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset aria-label={label} className="flex flex-col gap-1.5">
          {spec.options.map((o) => (
            <div key={o} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${id}-${o}`}
                checked={picked.includes(o)}
                onCheckedChange={(on) =>
                  onChange(spec.options.filter((x) => (x === o ? on : picked.includes(x))))
                }
              />
              <label htmlFor={`${id}-${o}`}>{display([o])}</label>
            </div>
          ))}
        </fieldset>
      );
    }
    case 'url':
      return (
        <InputGroup>
          <InputGroupInput
            id={id}
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
function useValueText(key: SettingKey, spec: ControlSpec) {
  const { t } = useTranslation();
  const locale = useLocale();
  const format = useFormat();
  const languages = new Intl.DisplayNames(locale, { type: 'language' });
  const option = (v: unknown): string => {
    if (key === 'i18n.default_locale') return languages.of(String(v)) ?? String(v);
    if (key === 'booking.public_registration_mode') {
      return t(`settings-ui.values.public_registration_mode.${String(v)}` as never) as string;
    }
    if (key === 'avis.required_reference_types') {
      return t(`settings-ui.values.reference_type.${String(v)}` as never) as string;
    }
    return typeof v === 'number' ? format.number(v) : String(v);
  };
  return (value: unknown): string => {
    switch (spec.kind) {
      case 'switch':
        return value ? t(($) => $['settings-ui'].values.on) : t(($) => $['settings-ui'].values.off);
      case 'list': {
        const list = Array.isArray(value) ? value : [];
        return list.length === 0
          ? t(($) => $['settings-ui'].values.none)
          : list.map(option).join(', ');
      }
      case 'url':
        return typeof value === 'string' ? value : t(($) => $['settings-ui'].values.none);
      default:
        return option(value);
    }
  };
}

/** A field error by zod issue code, with the range of number fields. */
function useSettingMessage(spec: ControlSpec) {
  const { t } = useTranslation();
  const format = useFormat();
  return (error: FormFieldError | undefined): string | undefined => {
    if (!error) return undefined;
    if (spec.kind === 'number') {
      return t(($) => $['settings-ui'].validation.number_range, {
        min: format.number(spec.min),
        max: format.number(spec.max),
      });
    }
    if (spec.kind === 'url') return t(($) => $['settings-ui'].validation.url);
    if (spec.kind === 'list' && error.type === 'custom') {
      return t(($) => $['settings-ui'].validation.duplicate);
    }
    return t(($) => $['settings-ui'].validation.invalid);
  };
}
