import { createHmac } from 'node:crypto';
import { hashToken, type TokenHash } from '../db/ids.ts';
import { env } from './env.ts';

/** Every kind of emailed or linked token. The purpose separates the HMAC domains. */
export type TokenPurpose =
  | 'magic_link'
  | 'password_reset'
  | 'invitation'
  | 'carrier_invitation'
  | 'registration'
  | 'driver';

/**
 * `base64url(HMAC-SHA256(TOKEN_SECRET, "<purpose>:<row id>"))`, 256 bits (ADR-0003, ADR-0008).
 * The database stores `hashToken(token)` only; the sender recomputes the token from the row id,
 * so neither the token nor a link sits in any table.
 */
export function deriveToken(
  purpose: TokenPurpose,
  rowId: string,
  secret = env.TOKEN_SECRET,
): string {
  return createHmac('sha256', secret).update(`${purpose}:${rowId}`).digest('base64url');
}

export function tokenHashFor(purpose: TokenPurpose, rowId: string): TokenHash {
  return hashToken(deriveToken(purpose, rowId));
}
