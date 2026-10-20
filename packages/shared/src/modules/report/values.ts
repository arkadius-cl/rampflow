import type { ValueOf } from '../../values/define.ts';

export const KpiUnit = {
  count: 'count',
  percent: 'percent',
  minutes: 'minutes',
} as const;
export type KpiUnit = ValueOf<typeof KpiUnit>;
