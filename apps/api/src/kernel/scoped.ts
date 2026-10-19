import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { type Scope, withScope } from '../db/scope.ts';
import { loadAccess } from './access.ts';
import type { AppEnv } from './env.ts';

const ROLLBACK = Symbol('rollback');

export type ScopeResolver = (c: Context<AppEnv>) => Promise<Scope>;

/**
 * Runs the rest of the request in one transaction under the resolved scope (ADR-0002).
 * Any error or any response with status >= 400 rolls back, so a 409 after a partial write
 * commits nothing. Mount once per area.
 */
export const scoped = (resolve: ScopeResolver) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const scope = await resolve(c);
    await withScope(scope, async (tx) => {
      c.set('scope', scope);
      c.set('db', tx);
      c.set('access', await loadAccess(tx, scope, c.var.clock));
      await next();
      if (c.error || c.res.status >= 400) throw ROLLBACK;
    }).catch((e: unknown) => {
      if (e !== ROLLBACK) throw e;
    });
  });
