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

/** Vite's `--mode`: the two standard modes, and `e2e` for the Playwright run without devtools. */
export const ViteMode = {
  development: NodeEnv.development,
  production: NodeEnv.production,
  e2e: 'e2e',
} as const;
export type ViteMode = ValueOf<typeof ViteMode>;
