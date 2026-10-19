import { zodResolver } from '@hookform/resolvers/zod';
import { STAFF_LOCALES } from '@rampflow/shared';
import { CreateSite, type SiteView } from '@rampflow/shared/modules/core/api.sites';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Controller, type Path, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
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
import { api, call } from '@/lib/api';
import { useIssueText } from './form';
import { useRefreshMasterData } from './queries';

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
  defaultLocale: 'de',
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{site ? t(($) => $.sites.edit_site) : t(($) => $.sites.new_site)}</SheetTitle>
          <SheetDescription>{t(($) => $.sites.form_description)}</SheetDescription>
        </SheetHeader>
        {open ? <SiteForm orgId={orgId} site={site} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SiteForm({ orgId, site, onDone }: { orgId: string; site?: SiteView; onDone: () => void }) {
  const { t } = useTranslation();
  const message = useIssueText();
  const navigate = useNavigate();
  const refresh = useRefreshMasterData(orgId);
  const form = useForm<SiteValues>({
    resolver: zodResolver(CreateSite),
    defaultValues: site ? valuesOf(site) : EMPTY,
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
  const [zones] = useState(() => {
    const current = form.getValues('timeZone');
    return TIME_ZONES.includes(current) ? TIME_ZONES : [current, ...TIME_ZONES];
  });

  const text = (
    name: Path<SiteValues>,
    label: string,
    o: { description?: string; nullable?: boolean; upper?: boolean; autoComplete?: string } = {},
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
              const raw = o.upper ? e.target.value.toUpperCase() : e.target.value;
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
          {text(
            'country',
            t(($) => $.sites.fields.country),
            {
              upper: true,
              description: t(($) => $.sites.fields.country_hint),
            },
          )}
          {text(
            'subdivision',
            t(($) => $.sites.fields.subdivision),
            {
              upper: true,
              nullable: true,
              description: t(($) => $.sites.fields.subdivision_hint),
            },
          )}
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
                {STAFF_LOCALES.map((locale) => (
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
