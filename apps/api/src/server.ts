import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { APP_NAME } from '@rampflow/shared';
import { sql } from 'drizzle-orm';
import { createApp } from './app.ts';
import { db, pool } from './db/pool.ts';
import { pinnableClock, systemClock } from './kernel/clock.ts';
import { env } from './kernel/env.ts';
import { discoverJobs, startJobRunner } from './kernel/jobs.ts';
import { smtpMailer } from './kernel/mailer.ts';

/** RLS is the backstop only for a role that cannot bypass it (ADR-0002). */
async function assertRestrictedRole() {
  const { rows } = await db.execute<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
    sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const role = rows[0];
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `DATABASE_URL connects as ${role?.rolname ?? 'unknown'}, which bypasses row-level security. Use rampflow_app.`,
    );
  }
}

await assertRestrictedRole();

// One clock for requests and jobs, so a clock pinned through /api/test/clock moves both.
const clock = env.ENABLE_TEST_ROUTES ? pinnableClock(systemClock) : systemClock;

const app = createApp({
  clock,
  testRoutes: env.ENABLE_TEST_ROUTES,
  apiDocs: env.ENABLE_API_DOCS,
  static:
    env.NODE_ENV === 'production'
      ? {
          web: fileURLToPath(new URL('../../web/dist', import.meta.url)),
          driver: fileURLToPath(new URL('../../driver/dist', import.meta.url)),
        }
      : undefined,
});

const runner = env.ENABLE_JOBS
  ? startJobRunner(await discoverJobs(), { clock, mailer: smtpMailer() })
  : undefined;

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`${APP_NAME} api listening on http://localhost:${info.port}`);
});

function shutdown() {
  runner?.stop();
  server.close();
  void pool.end();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
