import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import { DriverEvent, DriverPhase, DriverScreen } from '@rampflow/shared/modules/driver/values';
import { VisibilityState } from '@rampflow/shared/values';
import { useCallback, useEffect, useReducer } from 'react';
import { ApiFailure, api, NetworkFailure } from './api';

// The PWA's one screen state machine (ADR-0008: no router). The phase says what the PWA can
// show; the booking status inside `ready` picks the home screen.

export type Phase =
  | { kind: typeof DriverPhase.starting }
  | { kind: typeof DriverPhase.invalid }
  | { kind: typeof DriverPhase.offline_link }
  | {
      kind: typeof DriverPhase.ready;
      view: DriverBookingView;
      /** The last poll failed for the network; `view` is the last known state (DR-03). */
      offline: boolean;
      briefing: boolean;
    };

export type Event =
  | { type: typeof DriverEvent.exchange_failed; network: boolean }
  /** `offline`: the service worker answered from its cache (DR-03). */
  | { type: typeof DriverEvent.polled; view: DriverBookingView; offline: boolean }
  | { type: typeof DriverEvent.poll_failed; network: boolean }
  | { type: typeof DriverEvent.open_briefing }
  | { type: typeof DriverEvent.close_briefing };

export function reduce(phase: Phase, event: Event): Phase {
  switch (event.type) {
    case DriverEvent.exchange_failed:
      return event.network ? { kind: DriverPhase.offline_link } : { kind: DriverPhase.invalid };
    case DriverEvent.polled:
      return {
        kind: DriverPhase.ready,
        view: event.view,
        offline: event.offline,
        briefing: phase.kind === DriverPhase.ready && phase.briefing,
      };
    case DriverEvent.poll_failed:
      if (!event.network) return { kind: DriverPhase.invalid };
      return phase.kind === DriverPhase.ready
        ? { ...phase, offline: true }
        : { kind: DriverPhase.offline_link };
    case DriverEvent.open_briefing:
    case DriverEvent.close_briefing:
      return phase.kind === DriverPhase.ready
        ? { ...phase, briefing: event.type === DriverEvent.open_briefing }
        : phase;
  }
}

/** DR-03: the screen for a booking status. */
export function homeScreen(status: DriverBookingView['booking']['status']): DriverScreen {
  switch (status) {
    case BookingStatus.requested:
    case BookingStatus.confirmed:
      return DriverScreen.booking;
    case BookingStatus.checked_in:
      return DriverScreen.waiting;
    case BookingStatus.called:
    case BookingStatus.at_dock:
    case BookingStatus.loading:
      return DriverScreen.called;
    case BookingStatus.done:
      return DriverScreen.done;
    case BookingStatus.departed:
    case BookingStatus.cancelled:
    case BookingStatus.no_show:
    case BookingStatus.turned_away:
      return DriverScreen.closed;
  }
}

export const POLL_MS = 15_000;

/** Takes the token out of `/d#<token>` and out of the address bar and history. */
function takeFragmentToken(): string | null {
  const token = window.location.hash.slice(1);
  if (!token) return null;
  window.history.replaceState(null, '', '/d/');
  return token;
}

const isNetwork = (e: unknown) => e instanceof NetworkFailure;

async function pollEvent(): Promise<Event> {
  try {
    return { type: DriverEvent.polled, view: await api.booking(), offline: !navigator.onLine };
  } catch (e) {
    // Anything but a refused cookie keeps the last known state on screen.
    return {
      type: DriverEvent.poll_failed,
      network: !(e instanceof ApiFailure && e.status === 401),
    };
  }
}

/**
 * Runs once per page load, started before React and the catalogs so the round trips overlap
 * them: exchanges a fragment token for the cookie, redeems this phone's safety passes, then
 * polls the booking for the first time (ADR-0008).
 */
export async function boot(): Promise<Event> {
  const token = takeFragmentToken();
  if (token) {
    try {
      await api.exchange(token);
    } catch (e) {
      return { type: DriverEvent.exchange_failed, network: isNetwork(e) };
    }
  }
  // The safety module may be off; the booking view works without it.
  await api.briefings().catch(() => undefined);
  return pollEvent();
}

/** The session after `boot`: polls every 15 s while the page is visible, and at once on return. */
export function useDriverSession(booted: Promise<Event>) {
  const [phase, dispatch] = useReducer(reduce, { kind: DriverPhase.starting });
  const polling = phase.kind === DriverPhase.ready;

  useEffect(() => {
    void booted.then(dispatch);
  }, [booted]);

  const poll = useCallback(async () => dispatch(await pollEvent()), []);

  useEffect(() => {
    if (!polling) return;
    const tick = () => {
      if (document.visibilityState === VisibilityState.visible) void poll();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [polling, poll]);

  return {
    phase,
    poll,
    openBriefing: () => dispatch({ type: DriverEvent.open_briefing }),
    closeBriefing: () => dispatch({ type: DriverEvent.close_briefing }),
  };
}
