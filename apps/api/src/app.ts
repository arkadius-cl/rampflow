import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { db } from './db/pool.ts';
import { apiDocs } from './kernel/api-docs.ts';
import { type Clock, isPinnable, pinnableClock, systemClock } from './kernel/clock.ts';
import { type AppEnv, env } from './kernel/env.ts';
import { describeForLog, onError, onNotFound } from './kernel/errors.ts';
import { requireSameOrigin } from './kernel/origin.ts';
import { securityHeaders } from './kernel/security-headers.ts';
import { type StaticRoots, staticFiles } from './kernel/static.ts';
import { testRoutes } from './kernel/test-routes.ts';
import { modulesApi } from './modules/index.ts';

export interface AppOptions {
  clock?: Clock;
  /** Origins whose mutating requests the API accepts; defaults to APP_ORIGIN and APP_EXTRA_ORIGINS. */
  origins?: readonly string[];
  testRoutes?: boolean;
  /** Swagger UI at `/api/docs` and the document at `/api/openapi.json` (development). */
  apiDocs?: boolean;
  /** Serve the built SPAs (production). */
  static?: StaticRoots;
  /** Production adds HSTS; defaults to `NODE_ENV=production`. */
  production?: boolean;
}

const health = new Hono<AppEnv>().get('/', async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ok', db: 'ok' } as const, 200);
  } catch (err) {
    console.error(`health: database check failed ${describeForLog(err)}`);
    return c.json({ status: 'degraded', db: 'error' } as const, 503);
  }
});

function buildApi(options: AppOptions) {
  const base = options.clock ?? systemClock;
  const pinnable = options.testRoutes ? (isPinnable(base) ? base : pinnableClock(base)) : null;
  const clock = pinnable ?? base;
  return new Hono<AppEnv>()
    .use(
      createMiddleware<AppEnv>(async (c, next) => {
        c.set('clock', clock);
        await next();
      }),
    )
    .use(requireSameOrigin(options.origins ?? [env.APP_ORIGIN, ...env.APP_EXTRA_ORIGINS]))
    .route('/health', health)
    .route('/test', pinnable ? testRoutes(pinnable) : new Hono<AppEnv>())
    .route('/', options.apiDocs ? apiDocs() : new Hono<AppEnv>())
    .route('/', modulesApi);
}

/** The whole HTTP surface. Tests build their own with a fixed clock. */
export function createApp(options: AppOptions = {}) {
  const api = buildApi(options);
  const app = new Hono<AppEnv>()
    .use(securityHeaders({ hsts: options.production ?? env.NODE_ENV === 'production' }))
    .route('/api', api);
  if (options.static) app.route('/', staticFiles(options.static));
  return app.onError(onError).notFound(onNotFound);
}

export const app = createApp({
  testRoutes: env.ENABLE_TEST_ROUTES,
  apiDocs: env.ENABLE_API_DOCS,
});

export type AppType = typeof app;
