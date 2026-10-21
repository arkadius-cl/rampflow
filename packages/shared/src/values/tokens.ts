import type { ValueOf } from './define.ts';

/** Every kind of emailed or linked token. The purpose separates the HMAC domains (ADR-0003, ADR-0008). */
export const TokenPurpose = {
  magic_link: 'magic_link',
  password_reset: 'password_reset',
  invitation: 'invitation',
  carrier_invitation: 'carrier_invitation',
  registration: 'registration',
  driver: 'driver',
  signup: 'signup',
} as const;
export type TokenPurpose = ValueOf<typeof TokenPurpose>;

/** How far the one-time exchange of an emailed token has come in the browser. */
export const TokenExchangeStatus = {
  pending: 'pending',
  done: 'done',
  failed: 'failed',
} as const;
export type TokenExchangeStatus = ValueOf<typeof TokenExchangeStatus>;
