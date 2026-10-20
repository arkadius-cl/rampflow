import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { StaffLocale, values } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LanguagesIcon, LogOutIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, call } from '@/lib/api';
import { applyLocale, isStaffLocale, useLocale } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';

/** Each language named in itself, so a user who cannot read the current UI still finds theirs. */
const LANGUAGE_NAME: Record<StaffLocale, string> = { de: 'Deutsch', en: 'English', pl: 'Polski' };

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => call(api.auth.logout.$post()),
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });
}

/** Switches the UI language; for a signed-in user it becomes their `locale` (emails follow it). */
export function useChangeLocale(signedIn: boolean) {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  return async (locale: StaffLocale) => {
    await applyLocale(i18n, locale);
    if (!signedIn) return;
    const me = await call<MeResponse>(api.me.$patch({ json: { locale } }));
    queryClient.setQueryData(queryKeys.me(), me);
  };
}

/**
 * Applies the user's language, else `fallback` (the tenant's `i18n.default_locale`), once the
 * signed-in user is known. A user without a locale keeps this device's choice when no fallback
 * is given.
 */
export function useSyncLocale(me: MeResponse | undefined, fallback?: StaffLocale) {
  const { i18n } = useTranslation();
  const wanted = me?.user.locale ?? fallback;
  useEffect(() => {
    if (wanted && isStaffLocale(wanted) && i18n.language !== wanted) void applyLocale(i18n, wanted);
  }, [wanted, i18n]);
}

function LanguageItems({ onChange }: { onChange: (l: StaffLocale) => void }) {
  const locale = useLocale();
  return (
    <DropdownMenuRadioGroup
      value={locale}
      onValueChange={(value) => (isStaffLocale(value) ? onChange(value) : undefined)}
    >
      {values(StaffLocale).map((l) => (
        <DropdownMenuRadioItem key={l} value={l} lang={l}>
          {LANGUAGE_NAME[l]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/** The items of the signed-in user's menu: who, other places to go, language, sign out. */
export function UserMenuItems({ me, children }: { me: MeResponse; children?: React.ReactNode }) {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const changeLocale = useChangeLocale(true);
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>
          <div className="truncate text-sm font-medium text-foreground">{me.user.name}</div>
          <div className="truncate text-xs">{me.user.email}</div>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      {children}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <LanguagesIcon />
          {t(($) => $.shell.language)}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <LanguageItems onChange={(l) => void changeLocale(l)} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => signOut.mutate()} data-testid="sign-out">
        <LogOutIcon />
        {t(($) => $.shell.sign_out)}
      </DropdownMenuItem>
    </>
  );
}

/** The language picker of pages without a user menu (sign-in, token pages, org picker). */
export function LanguageMenu({ signedIn = false }: { signedIn?: boolean }) {
  const locale = useLocale();
  const changeLocale = useChangeLocale(signedIn);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        <LanguagesIcon />
        {LANGUAGE_NAME[locale]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <LanguageItems onChange={(l) => void changeLocale(l)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
