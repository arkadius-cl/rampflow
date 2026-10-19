import { createMiddleware } from 'hono/factory';

const BASELINE = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
} as const;

const HSTS = 'max-age=31536000; includeSubDomains';

/**
 * Headers on every answer of the API and the SPAs it serves in production. A route that sets
 * its own policy keeps it: the driver PWA's CSP and `no-referrer` under `/d` (ADR-0008).
 * HSTS only in production, where the app runs behind HTTPS.
 */
export const securityHeaders = (o: { hsts: boolean }) =>
  createMiddleware(async (c, next) => {
    await next();
    const headers = { ...BASELINE, ...(o.hsts ? { 'Strict-Transport-Security': HSTS } : {}) };
    for (const [name, value] of Object.entries(headers)) {
      if (!c.res.headers.has(name)) c.res.headers.set(name, value);
    }
  });
