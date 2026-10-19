import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { ApiError } from './errors.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Mutating requests must come from one of the app's own origins (ADR-0003). Runs before routing. */
export function requireSameOrigin(origins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(origins.map((o) => new URL(o).origin));
  return createMiddleware(async (c, next) => {
    if (MUTATING.has(c.req.method) && !allowed.has(c.req.header('Origin') ?? '')) {
      throw new ApiError('forbidden', 'Cross-origin request refused', { reason: 'origin' });
    }
    await next();
  });
}
