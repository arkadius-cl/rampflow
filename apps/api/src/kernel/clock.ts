/** The only source of "now" for domain code (ADR-0012). Tests inject a `TestClock`. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface TestClock extends Clock {
  set(at: Date): void;
  advance(ms: number): void;
}

/** The API clock under ENABLE_TEST_ROUTES: `POST /api/test/clock` pins it for e2e runs. */
export interface PinnableClock extends Clock {
  pin(at: Date | null): void;
}

export const isPinnable = (clock: Clock): clock is PinnableClock => 'pin' in clock;

export function pinnableClock(base: Clock): PinnableClock {
  let pinned: Date | null = null;
  return {
    now: () => (pinned ? new Date(pinned) : base.now()),
    pin: (at) => {
      pinned = at;
    },
  };
}

export function testClock(start: Date): TestClock {
  let at = start.getTime();
  return {
    now: () => new Date(at),
    set: (next) => {
      at = next.getTime();
    },
    advance: (ms) => {
      at += ms;
    },
  };
}
