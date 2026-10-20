import type { ValueOf } from './define.ts';

export const NodeEnv = {
  development: 'development',
  test: 'test',
  production: 'production',
} as const;
export type NodeEnv = ValueOf<typeof NodeEnv>;
