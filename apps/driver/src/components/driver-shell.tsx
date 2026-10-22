import { isTheme } from '@rampflow/shared/modules/core/theme';
import { Density, DriverLocale, Theme, values } from '@rampflow/shared/values';
import { WifiOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  applyLocale,
  isDriverLocale,
  isMachineTranslated,
  LANGUAGE_NAMES,
  useLocale,
} from '@/lib/i18n';
import { useDensity, useDeviceTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

// The driver shell of apps/web/src/components/shells/driver-shell.tsx: one column, driver density
// (ADR-0021), one sticky primary action. Here with the live language switcher (DR-02) and the
// appearance switch next to it, both kept on this phone.

export interface DriverShellProps {
  tenantName?: string;
  logoUrl?: string | null;
  /** "HH:mm CET" of the last known state while offline (DR-03). */
  offlineSince?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DriverShell({
  tenantName,
  logoUrl,
  offlineSince,
  footer,
  children,
  className,
}: DriverShellProps) {
  const { t } = useTranslation();
  useDensity(Density.fahrer);
  return (
    <div
      data-density={Density.fahrer}
      className={cn('flex min-h-svh flex-col bg-background text-foreground', className)}
    >
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="size-8 rounded-md object-contain" />
        ) : (
          <div
            aria-hidden
            className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
          >
            {(tenantName ?? 'rf').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-24 flex-1 truncate text-sm font-medium">
          {tenantName ?? 'rampflow'}
        </div>
        {/* Both switches wrap to a second row on a narrow phone. */}
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher label={t(($) => $.app.language)} />
          <ThemeSwitcher label={t(($) => $.app.theme.label)} />
        </div>
      </header>
      {offlineSince ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b bg-tone-onsite-bg px-4 py-2 text-sm text-tone-onsite"
        >
          <WifiOffIcon className="size-4 shrink-0" />
          {t(($) => $.app.offline_banner, { time: offlineSince })}
        </div>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col gap-gap px-pad py-pad">{children}</main>
      {footer ? (
        <footer className="sticky bottom-0 shrink-0 border-t bg-background p-pad pb-[max(var(--pad),env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

/** A native select: one tap opens the phone's own picker with all twelve languages. */
function LanguageSwitcher({ label }: { label: string }) {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const machine = isMachineTranslated(locale);
  return (
    <div className="flex items-center gap-1.5">
      {machine ? (
        <span
          data-testid="machine-badge"
          title={t(($) => $.app.machine_hint)}
          className="rounded-sm bg-tone-onsite-bg px-1.5 py-0.5 text-xs font-semibold text-tone-onsite"
        >
          {t(($) => $.app.machine_badge)}
          <span className="sr-only">: {t(($) => $.app.machine_hint)}</span>
        </span>
      ) : null}
      <NativeSelect
        aria-label={label}
        value={locale}
        onChange={(e) => {
          if (isDriverLocale(e.target.value)) void applyLocale(i18n, e.target.value);
        }}
        className="w-32"
      >
        {values(DriverLocale).map((l) => (
          <NativeSelectOption key={l} value={l} lang={l}>
            {LANGUAGE_NAMES[l]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * "Darstellung: Hell · Dunkel · Wie System" as a native select, the same control as the language
 * switch: one tap, no toggle group in the initial bundle (ADR-0008).
 */
function ThemeSwitcher({ label }: { label: string }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useDeviceTheme();
  return (
    <NativeSelect
      aria-label={label}
      data-testid="theme-switch"
      value={theme}
      onChange={(e) => {
        if (isTheme(e.target.value)) setTheme(e.target.value);
      }}
      className="w-28"
    >
      {values(Theme).map((value) => (
        <NativeSelectOption key={value} value={value}>
          {t(($) => $.app.theme[value])}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
