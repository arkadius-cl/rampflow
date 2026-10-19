import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import { useCallback, useEffect, useReducer } from 'react';
import { ApiFailure, api, NetworkFailure } from './api';

// The PWA's one screen state machine (ADR-0008: no router). The phase says what the PWA can
// show; the booking status inside `ready` picks the home screen.

export type Phase =
  | { kind: 'starting' }
  /** Unknown, expired or revoked link, or no link at all (DR-01). */
  | { kind: 'invalid' }
  /** A new link opened offline: the exchange failed, so the cached booking is not this one. */
  | { kind: 'offline_link' }
  | {
      kind: 'ready';
      view: DriverBookingView;
      /** The last poll failed for the network; `view` is the last known state (DR-03). */
      offline: boolean;
      briefing: boolean;
    };

export type Event =
  | { type: 'exchange_failed'; network: boolean }
  /** `offline`: the service worker answered from its cache (DR-03). */
  | { type: 'polled'; view: DriverBookingView; offline: boolean }
  | { type: 'poll_failed'; network: boolean }
  | { type: 'open_briefing' }
  | { type: 'close_briefing' };

export function reduce(phase: Phase, event: Event): Phase {
  switch (event.type) {
    case 'exchange_failed':
      return event.network ? { kind: 'offline_link' } : { kind: 'invalid' };
    case 'polled':
      return {
        kind: 'ready',
        view: event.view,
        offline: event.offline,
        briefing: phase.kind === 'ready' && phase.briefing,
      };
    case 'poll_failed':
      if (!event.network) return { kind: 'invalid' };
      return phase.kind === 'ready' ? { ...phase, offline: true } : { kind: 'offline_link' };
    case 'open_briefing':
    case 'close_briefing':
      return phase.kind === 'ready'
        ? { ...phase, briefing: event.type === 'open_briefing' }
        : phase;
  }
}

export type HomeScreen = 'booking' | 'waiting' | 'called' | 'done' | 'closed';

/** DR-03: the screen for a booking status. */
export function homeScreen(status: DriverBookingView['booking']['status']): HomeScreen {
  switch (status) {
    case 'requested':
    case 'confirmed':
      return 'booking';
    case 'checked_in':
      return 'waiting';
    case 'called':
    case 'at_dock':
    case 'loading':
      return 'called';
    case 'done':
      return 'done';
    case 'departed':
    case 'cancelled':
    case 'no_show':
    case 'turned_away':
      return 'closed';
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
    return { type: 'polled', view: await api.booking(), offline: !navigator.onLine };
  } catch (e) {
    // Anything but a refused cookie keeps the last known state on screen.
    return { type: 'poll_failed', network: !(e instanceof ApiFailure && e.status === 401) };
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
      return { type: 'exchange_failed', network: isNetwork(e) };
    }
  }
  // The safety module may be off; the booking view works without it.
  await api.briefings().catch(() => undefined);
  return pollEvent();
}

/** The session after `boot`: polls every 15 s while the page is visible, and at once on return. */
export function useDriverSession(booted: Promise<Event>) {
  const [phase, dispatch] = useReducer(reduce, { kind: 'starting' });
  const polling = phase.kind === 'ready';

  useEffect(() => {
    void booted.then(dispatch);
  }, [booted]);

  const poll = useCallback(async () => dispatch(await pollEvent()), []);

  useEffect(() => {
    if (!polling) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void poll();
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
    openBriefing: () => dispatch({ type: 'open_briefing' }),
    closeBriefing: () => dispatch({ type: 'close_briefing' }),
  };
}
