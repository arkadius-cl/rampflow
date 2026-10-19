import { ChevronRightIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DriverShell } from '@/components/driver-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useLocale } from '@/lib/i18n';
import {
  type HomeScreen,
  homeScreen,
  type Event as SessionEvent,
  useDriverSession,
} from '@/lib/session';
import { siteTimeLabel } from '@/lib/time';
import { Home } from '@/screens/home';
import { InvalidLink, Loading, OfflineLink } from '@/screens/messages';

// Briefing and quiz load on demand, outside the 150 KB initial budget (ADR-0008).
const BriefingFlow = lazy(() => import('@/briefing/briefing-flow'));

/** DR-03: a call vibrates the phone once, where the browser allows it. */
function useVibrateOnCall(screen: HomeScreen | null) {
  const previous = useRef(screen);
  useEffect(() => {
    if (screen === 'called' && previous.current !== null && previous.current !== 'called') {
      navigator.vibrate?.([400, 200, 400]);
    }
    previous.current = screen;
  }, [screen]);
}

export function App({ booted }: { booted: Promise<SessionEvent> }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { phase, poll, openBriefing, closeBriefing } = useDriverSession(booted);
  const view = phase.kind === 'ready' ? phase.view : null;
  const screen = view ? homeScreen(view.booking.status) : null;
  useVibrateOnCall(screen);

  if (phase.kind === 'starting') {
    // No text yet: the fonts would compete with the first round trips on a slow network.
    return (
      <div data-density="touch" className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" aria-label={t(($) => $.app.loading)} />
      </div>
    );
  }
  if (phase.kind !== 'ready' || !view || !screen) {
    return (
      <DriverShell>{phase.kind === 'invalid' ? <InvalidLink /> : <OfflineLink />}</DriverShell>
    );
  }

  const shell = {
    tenantName: view.tenant.name,
    logoUrl: view.tenant.logoUrl,
    offlineSince: phase.offline ? siteTimeLabel(view.asOf, view.site.timeZone, locale) : undefined,
  };

  if (phase.briefing) {
    return (
      <Suspense
        fallback={
          <DriverShell {...shell}>
            <Loading />
          </DriverShell>
        }
      >
        <BriefingFlow
          shell={shell}
          onClose={closeBriefing}
          onDone={() => {
            closeBriefing();
            void poll();
          }}
        />
      </Suspense>
    );
  }

  const briefingDue =
    view.safety.status === 'missing' && (screen === 'booking' || screen === 'waiting');
  return (
    <DriverShell
      {...shell}
      footer={
        briefingDue && !phase.offline ? (
          <Button size="lg" className="h-13 w-full text-base" onClick={openBriefing}>
            {t(($) => $.app.safety.start)}
            <ChevronRightIcon aria-hidden />
          </Button>
        ) : undefined
      }
    >
      <Home screen={screen} view={view} />
    </DriverShell>
  );
}
