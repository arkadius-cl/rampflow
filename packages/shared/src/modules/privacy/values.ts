import type { ValueOf } from '../../values/define.ts';

/** A data subject request of TN-06: an export, or an erasure. */
export const PrivacyRequestKind = {
  export: 'export',
  erase: 'erase',
} as const;
export type PrivacyRequestKind = ValueOf<typeof PrivacyRequestKind>;
