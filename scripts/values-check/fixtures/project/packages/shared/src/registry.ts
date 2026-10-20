import type { permissions } from './modules/booking/manifest.ts';

export type PermissionKey = (typeof permissions)[number];
