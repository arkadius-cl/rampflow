import { and, asc, eq, lte } from 'drizzle-orm';
import type { TenantId } from '../../../db/ids.ts';
import type { Scope, Tx } from '../../../db/scope.ts';
import { loadAccess } from '../../../kernel/access.ts';
import type { Clock } from '../../../kernel/clock.ts';
import { describeForLog } from '../../../kernel/errors.ts';
import { forEachTenant, type Job, type JobStats } from '../../../kernel/jobs.ts';
import { systemActor } from '../../../kernel/system.ts';
import type { BookingContext } from '../lifecycle/context.ts';
import { noShowDueAt } from '../lifecycle/guards.ts';
import { transitionBooking } from '../lifecycle/transition.ts';
import { booking } from '../schema.ts';

const JOB = 'no_show';

/**
 * BK-08 for one tenant: every `confirmed` booking past `starts_at + yard.no_show_after_minutes`
 * goes through `mark_no_show`, which frees its capacity and emails the booking contact. A tenant
 * without the `yard` module is left alone: nobody could have checked those trucks in.
 */
async function markNoShows(tx: Tx, tenantId: TenantId, clock: Clock): Promise<JobStats> {
  const scope: Scope = { party: 'tenant', tenantId, siteIds: 'all', actor: systemActor(JOB) };
  const access = await loadAccess(tx, scope, clock);
  if (!access.entitlements?.modules.yard) return { yardOff: 1 };
  const now = clock.now();
  const started = await tx
    .select({ id: booking.id, siteId: booking.siteId, startsAt: booking.startsAt })
    .from(booking)
    .where(
      and(
        eq(booking.tenantId, tenantId),
        eq(booking.status, 'confirmed'),
        lte(booking.startsAt, now),
      ),
    )
    .orderBy(asc(booking.startsAt));
  const stats = { marked: 0, failed: 0 };
  for (const b of started) {
    const after = (await access.setting('yard.no_show_after_minutes', b.siteId)).value;
    if (now < noShowDueAt(b.startsAt, after)) continue;
    try {
      // A savepoint per booking: one failure leaves the tenant's other bookings marked.
      await tx.transaction(async (sp) => {
        const ctx: BookingContext = {
          tx: sp,
          tenantId,
          actor: { party: 'system', job: JOB },
          access,
          now,
        };
        if ((await transitionBooking(ctx, b.id, { type: 'mark_no_show' })).changed) stats.marked++;
      });
    } catch (e) {
      stats.failed++;
      console.error(`job ${JOB}: booking ${b.id} failed ${describeForLog(e)}`);
    }
  }
  return stats;
}

export const job: Job = {
  name: JOB,
  everySeconds: 60,
  run: (ctx) => forEachTenant(ctx, JOB, (tx, tenantId) => markNoShows(tx, tenantId, ctx.clock)),
};
