import type { ValueOf } from '../../values/define.ts';

/** The tabs of the gate screen. */
export const GateTab = {
  expected: 'expected',
  onsite: 'onsite',
  departed: 'departed',
} as const;
export type GateTab = ValueOf<typeof GateTab>;

/** The next step a dock station takes for the truck at its dock. */
export const DockStep = {
  dock: 'dock',
  loading: 'loading',
  uncall: 'uncall',
} as const;
export type DockStep = ValueOf<typeof DockStep>;
