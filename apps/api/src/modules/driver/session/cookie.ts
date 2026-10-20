import { NodeEnv } from '@rampflow/shared/values';
import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { env } from '../../../kernel/env.ts';
import { DRIVER_COOKIE } from '../../../kernel/scopes.ts';

// ADR-0008, "Exchange and session": the cookie holds the link token, out of the URL and out of
// JavaScript's reach, and only /api/driver/* ever sends it.

const OPTIONS = {
  httpOnly: true,
  // Secure everywhere but development, so the PWA works on a phone at the LAN dev origin.
  secure: env.NODE_ENV !== NodeEnv.development,
  sameSite: 'Strict',
  path: '/api/driver',
} as const;

export function setDriverCookie(c: Context, token: string, expiresAt: Date, now: Date): void {
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  setCookie(c, DRIVER_COOKIE, token, { ...OPTIONS, maxAge });
}

export function clearDriverCookie(c: Context): void {
  deleteCookie(c, DRIVER_COOKIE, OPTIONS);
}
