import { zodResolver } from '@hookform/resolvers/zod';
import type { ModuleId, SettingKey, SettingScope } from '@rampflow/shared';
import type { SettingEntry } from '@rampflow/shared/modules/core/api.settings';
import { SettingControl } from '@rampflow/shared/modules/core/values';
import { DisplayNamesType, LabelPart, Setting, ZodIssueCode } from '@rampflow/shared/values';
import { useMutation } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, type FieldError as FormFieldError, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
import { SettingField } from '@/components/settings-field';
import { Badge } from '@/components/ui/badge';
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

const labelKey = (key: SettingKey, part: LabelPart) => {
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
  const label = t(labelKey(entry.key, LabelPart.label) as never) as string;
  const message = useSettingMessage(spec);

  return (
    <form noValidate onSubmit={form.handleSubmit(({ value }) => save.mutate(value))}>
      <SettingField
        id={entry.key}
        label={label}
        description={t(labelKey(entry.key, LabelPart.description) as never) as string}
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
    case SettingControl.switch:
      return (
        <div className="flex h-8 items-center gap-2 text-sm">
          <Switch id={id} checked={value === true} onCheckedChange={(on) => onChange(on)} />
          <span aria-hidden>{display(value)}</span>
        </div>
      );
    case SettingControl.select:
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
    case SettingControl.number:
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
    case SettingControl.list: {
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
    case SettingControl.picker:
      return (
        <Picker
          id={id}
          label={label}
          options={spec.options}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          display={display}
        />
      );
    case SettingControl.url:
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

/** Letters NFD keeps whole, so `wlochy` finds Włochy as `osterreich` finds Österreich. */
const FOLD: Readonly<Record<string, string>> = {
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
};

/** Folds case and accents for search. */
const searchable = (text: string) =>
  text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łøđßæœ]/g, (c) => FOLD[c] ?? c);

/** The chosen members as removable chips; the others found by name or code and added. */
function Picker({
  id,
  label,
  options,
  value,
  onChange,
  display,
}: {
  id: string;
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (value: unknown) => void;
  display: (value: unknown) => string;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  // Adding or removing unmounts the pressed button; the search keeps keyboard users in place.
  const search = useRef<HTMLInputElement>(null);
  const name = (o: string) => display([o]);
  const byName = (a: string, b: string) => name(a).localeCompare(name(b), locale);
  const needle = searchable(query.trim());
  const add = (o: string) => {
    onChange([...value, o]);
    setQuery('');
    search.current?.focus();
  };
  const matches =
    needle === ''
      ? []
      : options
          .filter((o) => !value.includes(o))
          .filter((o) => searchable(name(o)).includes(needle) || searchable(o) === needle)
          .toSorted(byName)
          .slice(0, PICKER_MATCHES);
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={label} className="flex flex-wrap gap-1.5">
        {value.toSorted(byName).map((o) => (
          <li key={o}>
            <Badge variant="secondary" className="h-7 gap-1 pr-0.5 text-sm">
              {name(o)}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t(($) => $['settings-ui'].picker.remove, { name: name(o) })}
                onClick={() => {
                  onChange(value.filter((x) => x !== o));
                  search.current?.focus();
                }}
              >
                <XIcon />
              </Button>
            </Badge>
          </li>
        ))}
      </ul>
      <Input
        ref={search}
        id={id}
        type="search"
        className="max-w-sm"
        placeholder={t(($) => $['settings-ui'].picker.search)}
        aria-label={t(($) => $['settings-ui'].picker.search_label, { label })}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter adds the first match instead of saving the half-edited list.
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (matches[0]) add(matches[0]);
        }}
      />
      {needle === '' ? null : matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(($) => $['settings-ui'].picker.no_match)}
        </p>
      ) : (
        <ul className="flex max-w-sm flex-col divide-y rounded-md border">
          {matches.map((o) => (
            <li key={o} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span>
                {name(o)} <span className="text-muted-foreground">{o}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={t(($) => $['settings-ui'].picker.add_named, { name: name(o) })}
                onClick={() => add(o)}
              >
                <PlusIcon />
                {t(($) => $['settings-ui'].picker.add)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Search answers stay short; a longer list means the query is not specific yet. */
const PICKER_MATCHES = 8;

/** A setting value as text: the inherited hint, select options and the switch label. */
function useValueText(key: SettingKey, spec: ControlSpec) {
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
      case SettingControl.picker: {
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
function useSettingMessage(spec: ControlSpec) {
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
    if (spec.kind === SettingControl.picker && error.type === ZodIssueCode.too_small) {
      return t(($) => $['settings-ui'].validation.at_least_one);
    }
    return t(($) => $['settings-ui'].validation.invalid);
  };
}
