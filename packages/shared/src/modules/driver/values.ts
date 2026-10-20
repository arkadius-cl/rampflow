import type { ValueOf } from '../../values/define.ts';

/**
 * How a driver session reached us: the driver link, or a staff device at the gate (YD-02).
 * A safety acknowledgement records the channel of the session that made it.
 */
export const DriverChannel = {
  link: 'link',
  staff: 'staff',
} as const;
export type DriverChannel = ValueOf<typeof DriverChannel>;

/** What the driver PWA can show (ADR-0008: one state machine, no router). */
export const DriverPhase = {
  starting: 'starting',
  /** Unknown, expired or revoked link, or no link at all (DR-01). */
  invalid: 'invalid',
  /** A new link opened offline, so the cached booking is not this one. */
  offline_link: 'offline_link',
  ready: 'ready',
} as const;
export type DriverPhase = ValueOf<typeof DriverPhase>;

/** The events that move the driver PWA between phases. */
export const DriverEvent = {
  exchange_failed: 'exchange_failed',
  polled: 'polled',
  poll_failed: 'poll_failed',
  open_briefing: 'open_briefing',
  close_briefing: 'close_briefing',
} as const;
export type DriverEvent = ValueOf<typeof DriverEvent>;

/** The driver PWA's home screen for a booking status (DR-03). */
export const DriverScreen = {
  booking: 'booking',
  waiting: 'waiting',
  called: 'called',
  done: 'done',
  closed: 'closed',
} as const;
export type DriverScreen = ValueOf<typeof DriverScreen>;

/** The driver screens of the design prototype (`/design`). */
export const PrototypeDriverStep = {
  booking: DriverScreen.booking,
  briefing: 'briefing',
  quiz: 'quiz',
  waiting: DriverScreen.waiting,
  called: DriverScreen.called,
  done: DriverScreen.done,
} as const;
export type PrototypeDriverStep = ValueOf<typeof PrototypeDriverStep>;
