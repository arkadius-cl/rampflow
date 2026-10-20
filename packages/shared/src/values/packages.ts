import type { ValueOf } from './define.ts';

export const PackageId = {
  start: 'start',
  pro: 'pro',
  enterprise: 'enterprise',
} as const;
export type PackageId = ValueOf<typeof PackageId>;
