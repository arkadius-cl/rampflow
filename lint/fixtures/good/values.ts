export const BookingStatus = {
  requested: 'requested',
  no_show: 'no_show',
  done: 'done',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];
