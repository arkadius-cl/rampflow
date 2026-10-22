import { Density } from '@rampflow/shared/values';
import { LanguagesIcon, WifiOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDensity } from '@/hooks/use-density';
import { cn } from '@/lib/utils';

export interface DriverShellProps {
  tenantName: string;
  /** BCP 47 code shown on the language switcher. */
  locale: string;
  /** DR-02: machine-translated locales carry a badge. */
  machineTranslated?: boolean;
  offlineSince?: string;
  /** Sticky bottom action, always reachable with a thumb. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Driver PWA shell: one column, no account, one sticky primary action.
 * Driver density (ADR-0021): 44 px targets, a 56 px primary action, 17 px type; the appearance
 * follows the phone unless the driver chose one (drivers often use dark mode at night).
 */
export function DriverShell({
  tenantName,
  locale,
  machineTranslated,
  offlineSince,
  footer,
  children,
  className,
}: DriverShellProps) {
  useDensity(Density.fahrer);
  return (
    <div
      data-density={Density.fahrer}
      className={cn('flex min-h-full flex-1 flex-col bg-background text-foreground', className)}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          {tenantName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{tenantName}</div>
        <Button variant="outline" size="sm" className="gap-1.5 uppercase">
          <LanguagesIcon />
          {locale}
          {machineTranslated ? (
            <span className="rounded-sm bg-tone-onsite-bg px-1 text-[10px] font-semibold normal-case text-tone-onsite">
              auto
            </span>
          ) : null}
        </Button>
      </header>
      {offlineSince ? (
        <div className="flex items-center gap-2 border-b bg-tone-onsite-bg px-4 py-2 text-sm text-tone-onsite">
          <WifiOffIcon className="size-4 shrink-0" />
          Offline. Showing status from {offlineSince}.
        </div>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {children}
      </main>
      {footer ? (
        <footer className="shrink-0 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

/** Shows a phone-sized viewport with a bezel on wide screens, full-bleed on real phones. */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-start justify-center bg-canvas sm:items-center sm:py-8">
      <div className="flex h-svh w-full flex-col overflow-hidden bg-background sm:h-[844px] sm:w-[390px] sm:rounded-[2.5rem] sm:border-[10px] sm:border-neutral-900 sm:shadow-2xl">
        {children}
      </div>
    </div>
  );
}
