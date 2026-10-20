import type { ValueOf } from './define.ts';

/** `PromiseSettledResult.status` of `Promise.allSettled`. */
export const PromiseStatus = {
  fulfilled: 'fulfilled',
  rejected: 'rejected',
} as const;
export type PromiseStatus = ValueOf<typeof PromiseStatus>;

/** The `console` methods that write a line. */
export const ConsoleMethod = {
  log: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
} as const;
export type ConsoleMethod = ValueOf<typeof ConsoleMethod>;
