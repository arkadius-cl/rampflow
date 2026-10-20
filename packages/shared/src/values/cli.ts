import type { ValueOf } from './define.ts';

// The arguments of the repo's own command-line scripts under scripts/.

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
