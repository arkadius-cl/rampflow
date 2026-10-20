import type { ValueOf } from './define.ts';

/** The `type` of a `node:util` `parseArgs` option. */
export const CliOptionType = {
  string: 'string',
  boolean: 'boolean',
} as const;
export type CliOptionType = ValueOf<typeof CliOptionType>;
