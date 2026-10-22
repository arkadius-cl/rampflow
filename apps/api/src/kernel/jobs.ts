import { globSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SuspendedTenants } from '@rampflow/shared/modules/core/values';
import type { JobName } from '@rampflow/shared/values';
import { OrgKind, ScopeParty } from '@rampflow/shared/values';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { TenantId } from '../db/ids.ts';
import { db } from '../db/pool.ts';
import { asScope, type Tx } from '../db/scope.ts';
import { jobRun, org } from '../modules/core/schema.ts';
import type { Clock } from './clock.ts';
import { describeForLog } from './errors.ts';
import type { Mailer } from './mailer.ts';
import { systemActor, systemScope } from './system.ts';

export type JobStats = Record<string, number>;

export interface JobContext {
  /** The tick's transaction. It holds the job lock; switch scope with `asScope`. */
  tx: Tx;
  clock: Clock;
  mailer: Mailer;
}

/** What `modules/<module>/jobs/<name>.ts` exports as `job` (ADR-0010). */
export interface Job {
  name: JobName;
  /** `null`: never scheduled in process, only run on demand (retention). */
  everySeconds: number | null;
  run(ctx: JobContext): Promise<JobStats>;
}

/** What the runner takes: a module's job, or a test's ad-hoc job under a unique name. */
export type RunnableJob = Omit<Job, 'name'> & { name: string };

const MODULES_DIR = fileURLToPath(new URL('../modules', import.meta.url));

/** Every `job` export under `modules/<module>/jobs/<name>.ts`. No list file exists. */
export async function discoverJobs(): Promise<Job[]> {
  const files = globSync('*/jobs/*.ts', { cwd: MODULES_DIR }).filter(
    (f) => !f.endsWith('.test.ts'),
  );
  const jobs: Job[] = [];
  for (const file of files.sort()) {
    const mod: { job?: Job } = await import(pathToFileURL(join(MODULES_DIR, file)).href);
    if (!mod.job || typeof mod.job.run !== 'function') throw new Error(`${file} exports no job`);
    jobs.push(mod.job);
  }
  return jobs;
}

export type TickResult = { ran: false } | { ran: true; stats: JobStats };

/**
 * One tick, at most once across every API instance: the tick's transaction holds
 * `pg_try_advisory_xact_lock('job:<name>')`, and a second runner returns at once. The job runs
 * inside that transaction, so a tick costs one pool connection.
 */
export function runJobTick(job: RunnableJob, ctx: Omit<JobContext, 'tx'>): Promise<TickResult> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${`job:${job.name}`}, 0)) as locked`,
    );
    if (!rows[0]?.locked) return { ran: false } as const;
    const startedAt = ctx.clock.now();
    const stats = await job.run({ ...ctx, tx });
    await tx
      .insert(jobRun)
      .values({ job: job.name, startedAt, finishedAt: ctx.clock.now(), stats });
    return { ran: true, stats } as const;
  });
}

/**
 * Runs `step` for every tenant under a tenant scope with actor `system:<job>`, each in its own
 * savepoint: one tenant's failure is logged and rolled back, the others still commit. Suspended
 * tenants are skipped unless the job includes them (ADR-0018); retention does.
 */
export async function forEachTenant(
  ctx: JobContext,
  job: JobName,
  step: (tx: Tx, tenantId: TenantId) => Promise<JobStats>,
  options: { suspended: SuspendedTenants } = { suspended: SuspendedTenants.skip },
): Promise<JobStats> {
  const unsuspended =
    options.suspended === SuspendedTenants.skip ? isNull(org.suspendedAt) : undefined;
  const tenants = await asScope(ctx.tx, systemScope(job), (tx) =>
    tx
      .select({ id: org.id })
      .from(org)
      .where(and(eq(org.kind, OrgKind.tenant), unsuspended)),
  );
  const total: JobStats = { tenants: tenants.length, failedTenants: 0 };
  for (const { id } of tenants) {
    const tenantId = id as string as TenantId;
    try {
      const stats = await ctx.tx.transaction((sp) =>
        asScope(
          sp,
          { party: ScopeParty.tenant, tenantId, siteIds: 'all', actor: systemActor(job) },
          (tx) => step(tx, tenantId),
        ),
      );
      for (const [k, v] of Object.entries(stats)) total[k] = (total[k] ?? 0) + v;
    } catch (e) {
      total.failedTenants = (total.failedTenants ?? 0) + 1;
      console.error(`job ${job}: tenant ${tenantId} failed ${describeForLog(e)}`);
    }
  }
  return total;
}

/** The in-process scheduler. Off with `ENABLE_JOBS=0` (tests, one-off scripts). */
export function startJobRunner(
  jobs: readonly Job[],
  ctx: Omit<JobContext, 'tx'>,
): { stop(): void } {
  const timers = jobs.flatMap((job) => {
    if (job.everySeconds === null) return [];
    let running = false;
    const tick = () => {
      if (running) return;
      running = true;
      runJobTick(job, ctx)
        .catch((e: unknown) => console.error(`job ${job.name} failed ${describeForLog(e)}`))
        .finally(() => {
          running = false;
        });
    };
    return [setInterval(tick, job.everySeconds * 1000)];
  });
  return { stop: () => timers.forEach(clearInterval) };
}
