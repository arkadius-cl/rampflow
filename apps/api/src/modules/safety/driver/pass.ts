import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { hashToken, type TokenHash } from '../../../db/ids.ts';

// The phone's device id for safety passes (ADR-0008): 32 random bytes in an HttpOnly cookie;
// `safety_pass` stores only their SHA-256.

export const DEVICE_COOKIE = 'rf_device';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function deviceHashOf(c: Context): TokenHash | null {
  const token = getCookie(c, DEVICE_COOKIE);
  return token ? hashToken(token) : null;
}

/** The phone's device hash, setting `rf_device` first when the phone has none. */
export function ensureDevice(c: Context): TokenHash {
  const existing = deviceHashOf(c);
  if (existing) return existing;
  const token = randomBytes(32).toString('base64url');
  setCookie(c, DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/api/driver',
    maxAge: ONE_YEAR_SECONDS,
  });
  return hashToken(token);
}
