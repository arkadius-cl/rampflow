import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../test/db.ts';
import { type World, world } from '../../test/world.ts';
import { hall, jobRun } from '../modules/core/schema.ts';
import { systemClock } from './clock.ts';
import { discoverJobs, forEachTenant, type Job, type JobStats, runJobTick } from './jobs.ts';
import type { Mailer } from './mailer.ts';

const mailer: Mailer = { send: async () => undefined };
const ctx = { clock: systemClock, mailer };

let w: World;
beforeAll(async () => {
  w = await world();
});

describe('job runner', () => {
  it('discovers the outbox job by file convention', async () => {
    expect((await discoverJobs()).map((j) => [j.name, j.everySeconds])).toContainEqual([
      'outbox',
      5,
    ]);
  });

  it('runs one tick when two runners start together', async () => {
    let runs = 0;
    const job: Job = {
      name: `singleton-${randomUUID()}`,
      everySeconds: 60,
      run: async () => {
        runs++;
        await new Promise((r) => setTimeout(r, 200));
        return { runs };
      },
    };
    const results = await Promise.all([runJobTick(job, ctx), runJobTick(job, ctx)]);
    expect(results.map((r) => r.ran).sort()).toEqual([false, true]);
    expect(runs).toBe(1);
    expect(await ownerDb().select().from(jobRun).where(eq(jobRun.job, job.name))).toHaveLength(1);
  });

  it('runs each tenant in its own scope; one failing tenant does not roll back another', async () => {
    const name = `halls-${randomUUID()}`;
    const job: Job = {
      name,
      everySeconds: null,
      run: (jobCtx) =>
        forEachTenant(jobCtx, name, async (tx, tenantId): Promise<JobStats> => {
          const side = tenantId === w.A.tenantId ? w.A : tenantId === w.B.tenantId ? w.B : null;
          if (!side) return {};
          await tx.insert(hall).values({ tenantId, siteId: side.sites[0].id, name });
          if (side === w.B) throw new Error('tenant B fails after its write');
          // The tenant scope confines the step: B's site is invisible to A's step.
          const foreign = await tx.select().from(hall).where(eq(hall.siteId, w.B.sites[0].id));
          return { written: 1, foreignVisible: foreign.length };
        }),
    };
    const tick = await runJobTick(job, ctx);
    expect(tick).toMatchObject({
      ran: true,
      stats: { written: 1, foreignVisible: 0, failedTenants: 1 },
    });
    const halls = await ownerDb()
      .select({ tenantId: hall.tenantId })
      .from(hall)
      .where(eq(hall.name, name));
    expect(halls).toEqual([{ tenantId: w.A.tenantId }]);
  });
});
