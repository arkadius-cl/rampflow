import type { ValueOf } from './define.ts';

// The arguments and vocabulary of the repo's own command-line scripts under scripts/.

/** The `type` of a `node:util` `parseArgs` option. */
export const CliOptionType = {
  string: 'string',
  boolean: 'boolean',
} as const;
export type CliOptionType = ValueOf<typeof CliOptionType>;

/** `node scripts/docs.mjs [mode]`: check that docs/INDEX.md is current, or write it. */
export const DocsMode = {
  check: 'check',
  index: 'index',
} as const;
export type DocsMode = ValueOf<typeof DocsMode>;

/** `node scripts/checkout-env.mjs [--e2e] [run -- <command> | --write]`. */
export const CheckoutEnvArg = {
  e2e: '--e2e',
  run: 'run',
  write: '--write',
  end_of_options: '--',
} as const;
export type CheckoutEnvArg = ValueOf<typeof CheckoutEnvArg>;

/** The packages `pnpm values:check` builds programs for, in run order. */
export const CheckedPackage = {
  shared: 'packages/shared',
  i18n: 'packages/i18n',
  api: 'apps/api',
  web: 'apps/web',
  driver: 'apps/driver',
  e2e: 'e2e',
} as const;
export type CheckedPackage = ValueOf<typeof CheckedPackage>;

/** What `values:check` says about a literal: use a member of a set, or create a set. */
export const VerdictKind = {
  set: 'set',
  create: 'create',
} as const;
export type VerdictKind = ValueOf<typeof VerdictKind>;

/** The `// → silent` mark of a values:check fixture line that must not be reported. */
export const FixtureMark = {
  silent: 'silent',
} as const;
export type FixtureMark = ValueOf<typeof FixtureMark>;
