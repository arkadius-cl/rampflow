import type { ValueOf } from './define.ts';

/** Which of the two instants of an autumn-fold wall time (ADR-0012). */
export const WallTimeFold = {
  earlier: 'earlier',
  later: 'later',
} as const;
export type WallTimeFold = ValueOf<typeof WallTimeFold>;
