import type { PermissionKey } from '../../registry.ts';
import type { BookingDto } from './api.ts';

export const isCancelled = (b: BookingDto): boolean => b.status === 'cancelled'; // → BookingStatus.cancelled

export const viewKey: PermissionKey = 'booking.view'; // → Permission.booking.view
