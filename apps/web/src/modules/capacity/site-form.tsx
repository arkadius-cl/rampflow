import { zodResolver } from '@hookform/resolvers/zod';
import { CreateSite, type SiteView } from '@rampflow/shared/modules/core/api.sites';
import { DisplayNamesType, StaffLocale, values } from '@rampflow/shared/values';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Controller, type Path, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type * as z from 'zod';
import { applyServerIssues, errorText } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { ApiFailure, api, call } from '@/lib/api';
import { useIssueText } from './form';
import { holidayRegionsQuery, siteCountriesQuery, useRefreshMasterData } from './queries';

// MD-01: create or edit a site's name, address, region, time zone and default language.

type SiteValues = z.input<typeof CreateSite>;

const EMPTY: SiteValues = {
  name: '',
  addressLine1: '',
  addressLine2: null,
  postalCode: '',
  city: '',
  country: 'DE',
  subdivision: null,
  timeZone: 'Europe/Berlin',
  defaultLocale: StaffLocale.de,
  phone: null,
};

const valuesOf = (site: SiteView): SiteValues => ({
  name: site.name,
  addressLine1: site.addressLine1,
  addressLine2: site.addressLine2,
  postalCode: site.postalCode,
  city: site.city,
  country: site.country,
  subdivision: site.subdivision,
  timeZone: site.timeZone,
  defaultLocale: site.defaultLocale,
  phone: site.phone,
});

const TIME_ZONES = Intl.supportedValuesOf('timeZone');

export function SiteFormSheet({
  orgId,
  site,
  open,
  onOpenChange,
}: {
  orgId: string;
  /** The site to edit; without it the sheet creates one. */
  site?: SiteView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const admitted = useQuery({ ...siteCountriesQuery, enabled: open });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{site ? t(($) => $.sites.edit_site) : t(($) => $.sites.new_site)}</SheetTitle>
          <SheetDescription>{t(($) => $.sites.form_description)}</SheetDescription>
        </SheetHeader>
        {!open ? null : admitted.data ? (
          <SiteForm
            orgId={orgId}
            site={site}
            admitted={admitted.data.items}
            onDone={() => onOpenChange(false)}
          />
        ) : admitted.error ? (
          <p role="alert" className="px-4 text-sm text-destructive">
            {admitted.error instanceof ApiFailure
              ? errorText(t, admitted.error)
              : t(($) => $.errors.internal_error)}
          </p>
        ) : (
          <Spinner className="mx-auto" />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SiteForm({
  orgId,
  site,
  admitted,
  onDone,
}: {
  orgId: string;
  site?: SiteView;
  /** The countries the platform admits sites in. */
  admitted: readonly string[];
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const message = useIssueText();
  const navigate = useNavigate();
  const refresh = useRefreshMasterData(orgId);
  const form = useForm<SiteValues>({
    resolver: zodResolver(CreateSite),
    // Without Germany admitted a new site starts with no country, never a hidden one.
    defaultValues: site
      ? valuesOf(site)
      : { ...EMPTY, country: admitted.includes(EMPTY.country) ? EMPTY.country : '' },
  });
  const save = useMutation({
    mutationFn: (body: SiteValues) =>
      site
        ? call(
            api.t[':orgId'].sites[':siteId'].$patch({
              param: { orgId, siteId: site.id },
              json: body,
            }),
          )
        : call(api.t[':orgId'].sites.$post({ param: { orgId }, json: body })),
    onSuccess: async (saved) => {
      await refresh();
      toast.success(t(($) => $.sites.saved));
      onDone();
      if (!site)
        await navigate({ to: '/t/$orgId/sites/$siteId', params: { orgId, siteId: saved.id } });
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames(i18n.language, { type: DisplayNamesType.region });
    // A site keeps a country the platform no longer admits, so it stays choosable here.
    const codes = new Set([...admitted, ...(site ? [site.country] : [])]);
    return [...codes]
      .map((code) => ({ code, name: names.of(code) ?? code }))
      .toSorted((a, b) => a.name.localeCompare(b.name, i18n.language));
  }, [admitted, site, i18n.language]);
  const country = useWatch({ control: form.control, name: 'country' });
  const { data: countryRegions } = useQuery(holidayRegionsQuery(country));
  const regions = useMemo(
    () =>
      (countryRegions?.items ?? []).toSorted((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [countryRegions, i18n.language],
  );
  const [zones] = useState(() => {
    const current = form.getValues('timeZone');
    return TIME_ZONES.includes(current) ? TIME_ZONES : [current, ...TIME_ZONES];
  });

  const text = (
    name: Path<SiteValues>,
    label: string,
    o: {
      description?: string;
      nullable?: boolean;
      autoComplete?: string;
    } = {},
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`site-${name}`}>{label}</FieldLabel>
          <Input
            id={`site-${name}`}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={(field.value as string | null | undefined) ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              field.onChange(o.nullable && raw.trim() === '' ? null : raw);
            }}
            autoComplete={o.autoComplete}
            aria-invalid={fieldState.invalid}
          />
          {o.description ? <FieldDescription>{o.description}</FieldDescription> : null}
          <FieldError>{message(fieldState.error)}</FieldError>
        </Field>
      )}
    />
  );

  return (
    <form
      noValidate
      className="flex flex-1 flex-col"
      onSubmit={form.handleSubmit((body) => save.mutate(body))}
    >
      <FieldGroup className="px-4">
        {text(
          'name',
          t(($) => $.sites.fields.name),
        )}
        {text(
          'addressLine1',
          t(($) => $.sites.fields.address_line1),
          {
            autoComplete: 'address-line1',
          },
        )}
        {text(
          'addressLine2',
          t(($) => $.sites.fields.address_line2),
          {
            nullable: true,
            autoComplete: 'address-line2',
          },
        )}
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
          {text(
            'postalCode',
            t(($) => $.sites.fields.postal_code),
            {
              autoComplete: 'postal-code',
            },
          )}
          {text(
            'city',
            t(($) => $.sites.fields.city),
            { autoComplete: 'address-level2' },
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="country"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="site-country">{t(($) => $.sites.fields.country)}</FieldLabel>
                <NativeSelect
                  id="site-country"
                  className="w-full"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={countries.some((c) => c.code === field.value) ? field.value : ''}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    const subdivision = form.getValues('subdivision');
                    if (subdivision && !subdivision.startsWith(`${e.target.value}-`)) {
                      form.setValue('subdivision', null);
                    }
                  }}
                  aria-invalid={fieldState.invalid}
                >
                  {countries.some((c) => c.code === field.value) ? null : (
                    <NativeSelectOption value="" disabled>
                      {t(($) => $.sites.fields.country_none)}
                    </NativeSelectOption>
                  )}
                  {countries.map((c) => (
                    <NativeSelectOption key={c.code} value={c.code}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError>
                  {field.value === ''
                    ? fieldState.error && t(($) => $.sites.validation.required)
                    : message(fieldState.error)}
                </FieldError>
              </Field>
            )}
          />
          <Controller
            name="subdivision"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="site-subdivision">
                  {t(($) => $.sites.fields.subdivision)}
                </FieldLabel>
                <NativeSelect
                  id="site-subdivision"
                  className="w-full"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  disabled={field.value == null && regions.length === 0}
                  aria-invalid={fieldState.invalid}
                >
                  <NativeSelectOption value="">
                    {t(($) => $.sites.fields.subdivision_none)}
                  </NativeSelectOption>
                  {field.value && !regions.some((r) => r.code === field.value) ? (
                    <NativeSelectOption value={field.value}>{field.value}</NativeSelectOption>
                  ) : null}
                  {regions.map((r) => (
                    <NativeSelectOption key={r.code} value={r.code}>
                      {r.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>{t(($) => $.sites.fields.subdivision_hint)}</FieldDescription>
                <FieldError>{message(fieldState.error)}</FieldError>
              </Field>
            )}
          />
        </div>
        <Controller
          name="timeZone"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="site-timeZone">{t(($) => $.sites.fields.time_zone)}</FieldLabel>
              <NativeSelect
                id="site-timeZone"
                className="w-full"
                {...field}
                aria-invalid={fieldState.invalid}
              >
                {zones.map((zone) => (
                  <NativeSelectOption key={zone} value={zone}>
                    {zone}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>{t(($) => $.sites.fields.time_zone_hint)}</FieldDescription>
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="defaultLocale"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="site-defaultLocale">
                {t(($) => $.sites.fields.default_locale)}
              </FieldLabel>
              <NativeSelect id="site-defaultLocale" className="w-full" {...field}>
                {values(StaffLocale).map((locale) => (
                  <NativeSelectOption key={locale} value={locale}>
                    {t(($) => $.sites.locales[locale])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
        />
        {text(
          'phone',
          t(($) => $.sites.fields.phone),
          {
            nullable: true,
            autoComplete: 'tel',
            description: t(($) => $.sites.fields.phone_hint),
          },
        )}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {site ? t(($) => $.sites.save) : t(($) => $.sites.create)}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t(($) => $.sites.cancel)}
        </Button>
      </SheetFooter>
    </form>
  );
}
