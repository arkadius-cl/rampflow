import type { BookingStatus, LoadStatus } from '@rampflow/shared/modules/booking/values';

export const loads: LoadStatus[] = [];

export const initial: BookingStatus = 'requested'; // → BookingStatus.requested
