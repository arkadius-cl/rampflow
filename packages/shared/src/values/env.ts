import type { ValueOf } from './define.ts';

export const NodeEnv = {
  development: 'development',
  test: 'test',
  production: 'production',
} as const;
export type NodeEnv = ValueOf<typeof NodeEnv>;

/** The connection strings of a checkout: the app role (RLS applies) and the owner role. */
export const DatabaseUrlVar = {
  DATABASE_URL: 'DATABASE_URL',
  MIGRATION_DATABASE_URL: 'MIGRATION_DATABASE_URL',
} as const;
export type DatabaseUrlVar = ValueOf<typeof DatabaseUrlVar>;

/** A boolean environment variable: `0` is off, `1` is on. */
export const EnvFlag = {
  off: '0',
  on: '1',
} as const;
export type EnvFlag = ValueOf<typeof EnvFlag>;
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
