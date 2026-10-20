import type { BookingStatus } from '@rampflow/shared';

export const pending: BookingStatus = 'requested'; // → BookingStatus.requested

export const states: BookingStatus[] = ['cancelled' as const]; // → BookingStatus.cancelled
