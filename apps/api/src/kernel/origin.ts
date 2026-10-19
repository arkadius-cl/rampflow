import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { ApiError } from './errors.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Mutating requests must come from the app's own origin (ADR-0003). Runs before routing. */
export function requireSameOrigin(appOrigin: string): MiddlewareHandler {
  const allowed = new URL(appOrigin).origin;
  return createMiddleware(async (c, next) => {
    if (MUTATING.has(c.req.method) && c.req.header('Origin') !== allowed) {
      throw new ApiError('forbidden', 'Cross-origin request refused', { reason: 'origin' });
    }
    await next();
  });
}
