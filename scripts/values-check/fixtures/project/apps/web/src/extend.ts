import { LoadStatus } from '@rampflow/shared/modules/booking/values';
import type { Booking } from './usage.ts';

export const first = LoadStatus.loading;

export const isRequested = (b: Booking): boolean => b.status === 'requested'; // → BookingStatus.requested
