import type { PermissionKey } from '../../registry.ts';

export const permissions = ['booking.view', 'booking.book'] as const;

export const defaultPermission: PermissionKey = 'booking.view'; // → silent
