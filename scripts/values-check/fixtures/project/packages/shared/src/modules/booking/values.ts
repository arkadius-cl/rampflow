import type { ValueOf } from '../../values/define.ts';

export const BookingStatus = {
  requested: 'requested',
  confirmed: 'confirmed',
  checked_in: 'checked_in',
  loading: 'loading',
  cancelled: 'cancelled',
  no_show: 'no_show',
} as const;
export type BookingStatus = ValueOf<typeof BookingStatus>;

export const LoadStatus = {
  confirmed: BookingStatus.confirmed,
  checked_in: BookingStatus.checked_in,
  loading: BookingStatus.loading,
} as const;
export type LoadStatus = ValueOf<typeof LoadStatus>;
