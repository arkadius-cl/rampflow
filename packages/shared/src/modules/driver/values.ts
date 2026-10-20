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
