import { ErrorCode, SeedScenario, ValidationTarget } from '@rampflow/shared/values';
import { Hono } from 'hono';
import * as z from 'zod';
import { world } from '../../test/world.ts';
import type { PinnableClock } from './clock.ts';
import type { AppEnv } from './env.ts';
import { ApiError } from './errors.ts';
import { discoverJobs, runJobTick } from './jobs.ts';
import { smtpMailer } from './mailer.ts';
import { validate } from './validate.ts';

// Mounted at /api/test only with ENABLE_TEST_ROUTES=1, which env.ts refuses in production.
// Seeding writes as the owner role (MIGRATION_DATABASE_URL), like the Vitest fixtures.

const SeedBody = z.object({ scenario: z.literal(SeedScenario.world) });
const ClockBody = z.object({ now: z.iso.datetime({ offset: true }).nullable() });

export const testRoutes = (clock: PinnableClock) =>
  new Hono<AppEnv>()
    .post('/seed', validate(ValidationTarget.json, SeedBody), async (c) =>
      c.json(await world(), 201),
    )
    .post('/clock', validate(ValidationTarget.json, ClockBody), (c) => {
      const { now } = c.req.valid('json');
      clock.pin(now === null ? null : new Date(now));
      return c.json({ now: clock.now().toISOString() }, 200);
    })
    .post('/jobs/:name/run', async (c) => {
      const job = (await discoverJobs()).find((j) => j.name === c.req.param('name'));
      if (!job) throw new ApiError(ErrorCode.not_found, 'No such job');
      return c.json(await runJobTick(job, { clock: c.var.clock, mailer: smtpMailer() }), 200);
    });
