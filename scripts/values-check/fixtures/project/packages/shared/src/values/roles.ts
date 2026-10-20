import type { ValueOf } from './define.ts';

export const Role = {
  admin: 'admin',
  user: 'user',
} as const;
export type Role = ValueOf<typeof Role>;
