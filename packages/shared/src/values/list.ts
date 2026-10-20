import type { ValueOf } from './define.ts';

/** The direction a list is sorted in. */
export const SortOrder = {
  asc: 'asc',
  desc: 'desc',
} as const;
export type SortOrder = ValueOf<typeof SortOrder>;
