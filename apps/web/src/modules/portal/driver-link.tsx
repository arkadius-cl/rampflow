import { DRIVER_LOCALES } from '@rampflow/shared';
import type {
  PortalBookingView,
  PortalDriverLink,
} from '@rampflow/shared/modules/booking/api.portal';
import { DriverLocale } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, MailIcon, RefreshCwIcon, Share2Icon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { portalDriverLinkQuery, portalKey } from './queries';

// CR-06: one link for the driver, shared by copy, by email in one of the 12 driver languages, or
// through the device's share sheet where the Web Share API exists. "Regenerate" revokes the old
// link (ADR-0008); copying and sharing never do.

type LinkBooking = Pick<PortalBookingView, 'id' | 'code' | 'tenant' | 'avis' | 'driverLink'>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The confirmation page and the booking page each show this card. After "Open booking" the router
// keeps the confirmation page on screen until the booking page's code has loaded, so what the
// carrier types there must carry over to the booking page's card.
interface Draft {
  email: string;
  locale: DriverLocale;
}
const drafts = new Map<string, Draft>();

export function DriverLinkCard({ orgId, booking }: { orgId: string; booking: LinkBooking }) {
  const { t } = useTranslation('booking');
  const link = useQuery({
    ...portalDriverLinkQuery(orgId, booking.id),
    enabled: booking.driverLink.active,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(($) => $.portal.driver.title)}</CardTitle>
        <CardDescription>{t(($) => $.portal.driver.description)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!booking.driverLink.active ? (
          <p className="text-sm text-muted-foreground">{t(($) => $.portal.driver.inactive)}</p>
        ) : link.data ? (
          <LinkActions orgId={orgId} booking={booking} link={link.data} />
        ) : (
          <Skeleton className="h-20 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

function LinkActions({
  orgId,
  booking,
  link,
}: {
  orgId: string;
  booking: LinkBooking;
  link: PortalDriverLink;
}) {
  const { t } = useTranslation('booking');
  const id = useId();
  const uiLocale = useLocale();
  const queryClient = useQueryClient();
  const languageName = new Intl.DisplayNames([uiLocale], { type: 'language' });
  const initial: DriverLocale =
    booking.avis?.driver.locale ??
    ((DRIVER_LOCALES as readonly string[]).includes(uiLocale)
      ? (uiLocale as DriverLocale)
      : DriverLocale.en);
  const [draft, setDraft] = useState<Draft>(
    () => drafts.get(booking.id) ?? { email: '', locale: initial },
  );
  useEffect(() => {
    drafts.set(booking.id, draft);
  }, [booking.id, draft]);
  const { email, locale } = draft;
  const [emailError, setEmailError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const param = { orgId, tenantId: booking.tenant.id, bookingId: booking.id };
  const linkApi = () => api.c[':orgId'].at[':tenantId'].bookings[':bookingId']['driver-link'];

  const copy = async () => {
    await navigator.clipboard.writeText(link.url);
    toast.success(t(($) => $.portal.driver.copied));
  };
  const share = async () => {
    try {
      await navigator.share({
        title: t(($) => $.portal.driver.share_title, { code: booking.code }),
        text: t(($) => $.portal.driver.share_text, { code: booking.code }),
        url: link.url,
      });
    } catch (e) {
      // Closing the share sheet rejects with AbortError; nothing to report.
      if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
    }
  };
  const send = useMutation({
    mutationFn: () => call(linkApi().email.$post({ param, json: { email, locale } })),
    onSuccess: () => {
      toast.success(t(($) => $.portal.driver.sent, { email }));
      setDraft((d) => ({ ...d, email: '' }));
    },
  });
  const regenerate = useMutation({
    mutationFn: () => call<PortalDriverLink>(linkApi().$post({ param })),
    onSuccess: async (fresh) => {
      queryClient.setQueryData(portalDriverLinkQuery(orgId, booking.id).queryKey, fresh);
      await queryClient.invalidateQueries({ queryKey: portalKey(orgId) });
      toast.success(t(($) => $.portal.driver.regenerated));
      setConfirming(false);
    },
  });

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${id}-url`}>{t(($) => $.portal.driver.link)}</FieldLabel>
        <InputGroup>
          <InputGroupInput id={`${id}-url`} readOnly value={link.url} className="font-mono" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="xs" onClick={copy}>
              <CopyIcon /> {t(($) => $.portal.driver.copy)}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <form
        noValidate
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = EMAIL.test(email.trim());
          setEmailError(!ok);
          if (ok) send.mutate();
        }}
      >
        <Field className="w-64" data-invalid={emailError}>
          <FieldLabel htmlFor={`${id}-email`}>{t(($) => $.portal.driver.email)}</FieldLabel>
          <Input
            id={`${id}-email`}
            type="email"
            autoComplete="off"
            value={email}
            aria-invalid={emailError}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
          <FieldError>{emailError ? t(($) => $.portal.driver.email_invalid) : null}</FieldError>
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor={`${id}-locale`}>{t(($) => $.portal.driver.language)}</FieldLabel>
          <NativeSelect
            id={`${id}-locale`}
            className="w-full"
            value={locale}
            onChange={(e) => setDraft({ ...draft, locale: e.target.value as DriverLocale })}
          >
            {DRIVER_LOCALES.map((l) => (
              <NativeSelectOption key={l} value={l}>
                {languageName.of(l)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit" variant="outline" className="mt-6" disabled={send.isPending}>
          {send.isPending ? <Spinner /> : <MailIcon />} {t(($) => $.portal.driver.send)}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' ? (
          <Button type="button" variant="outline" onClick={share}>
            <Share2Icon /> {t(($) => $.portal.driver.share)}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="ml-auto text-muted-foreground"
          onClick={() => setConfirming(true)}
        >
          <RefreshCwIcon /> {t(($) => $.portal.driver.regenerate)}
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.portal.driver.regenerate_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.portal.driver.regenerate_description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.portal.driver.keep)}</AlertDialogCancel>
            <AlertDialogAction
              disabled={regenerate.isPending}
              onClick={(e) => {
                e.preventDefault();
                regenerate.mutate();
              }}
            >
              {regenerate.isPending ? <Spinner /> : null}
              {t(($) => $.portal.driver.regenerate)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
