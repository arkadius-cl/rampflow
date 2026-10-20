import type { ValueOf } from './define.ts';

export const NodeEnv = {
  development: 'development',
  test: 'test',
  production: 'production',
} as const;
export type NodeEnv = ValueOf<typeof NodeEnv>;

/** Vite's `command`: the dev server, or a production build. */
export const ViteCommand = {
  serve: 'serve',
  build: 'build',
} as const;
export type ViteCommand = ValueOf<typeof ViteCommand>;
