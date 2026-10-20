import type { PermissionKey } from '../registry.ts';

export const Permission = {
  booking: { view: 'booking.view', book: 'booking.book' },
} as const satisfies Record<string, Record<string, PermissionKey>>;
