import { TaxIdStatus, TaxIdType, ViesError } from '@rampflow/shared/modules/core/values';
import { JobName, OrgKind } from '@rampflow/shared/values';
import { and, asc, eq, gt, lt, or } from 'drizzle-orm';
import * as z from 'zod';
import { asScope } from '../../../db/scope.ts';
import { env } from '../../../kernel/env.ts';
import type { Job, JobStats } from '../../../kernel/jobs.ts';
import { platformSystemScope } from '../../../kernel/system.ts';
import { org } from '../schema.ts';

// Design decision 12: confirms EU VAT numbers against VIES in the background, so neither the
// registration nor the verification ever waits for it or fails with it.

const HOUR_MS = 60 * 60_000;
const RETRY_DAYS = 7;
const BATCH = 50;
const TIMEOUT_MS = 10_000;

/** What one VIES answer means for the tenant's tax id. */
export type ViesResult =
  | typeof TaxIdStatus.verified
  | typeof TaxIdStatus.unverified
  | typeof TaxIdStatus.unavailable;

export interface ViesClient {
  /** `countryCode` as VIES spells it (`EL` for Greece), `vatNumber` without it. */
  check(id: { countryCode: string; vatNumber: string }): Promise<ViesResult>;
}

const ViesAnswer = z.union([
  z.object({ valid: z.boolean() }),
  z.object({ errorWrappers: z.array(z.object({ error: z.string() })).min(1) }),
]);

/**
 * The EC's REST API at `url`, or `null` for an empty `url`: then the job checks nothing. A
 * network error, a timeout or an answer it cannot read counts as no answer.
 */
export function viesClient(url: string, timeoutMs = TIMEOUT_MS): ViesClient | null {
  if (!url) return null;
  return {
    async check(id) {
      let body: unknown;
      try {
        const res = await fetch(`${url}/check-vat-number`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(id),
          signal: AbortSignal.timeout(timeoutMs),
        });
        body = await res.json();
      } catch {
        return TaxIdStatus.unavailable;
      }
      const answer = ViesAnswer.safeParse(body);
      if (!answer.success) return TaxIdStatus.unavailable;
      if ('valid' in answer.data) {
        return answer.data.valid ? TaxIdStatus.verified : TaxIdStatus.unverified;
      }
      return answer.data.errorWrappers.some((w) => w.error === ViesError.INVALID_INPUT)
        ? TaxIdStatus.unverified
        : TaxIdStatus.unavailable;
    },
  };
}

/**
 * Every 5 minutes, up to 50 tenants with an `eu_vat` id, oldest first: those `pending`, and
 * those `unavailable` for more than an hour while the tenant is younger than 7 days. Writes the
 * result and the check time; the stats count results only.
 */
export function makeTaxIdCheckJob(client: ViesClient | null): Job {
  return {
    name: JobName.core_tax_id_check,
    everySeconds: 300,
    async run(ctx) {
      const stats: JobStats = {
        [TaxIdStatus.verified]: 0,
        [TaxIdStatus.unverified]: 0,
        [TaxIdStatus.unavailable]: 0,
      };
      if (!client) return stats;
      const now = ctx.clock.now();
      return asScope(ctx.tx, platformSystemScope, async (tx) => {
        const due = await tx
          .select({ id: org.id, value: org.taxIdValue })
          .from(org)
          .where(
            and(
              eq(org.kind, OrgKind.tenant),
              eq(org.taxIdType, TaxIdType.eu_vat),
              or(
                eq(org.taxIdStatus, TaxIdStatus.pending),
                and(
                  eq(org.taxIdStatus, TaxIdStatus.unavailable),
                  lt(org.taxIdCheckedAt, new Date(now.getTime() - HOUR_MS)),
                  gt(org.createdAt, new Date(now.getTime() - RETRY_DAYS * 24 * HOUR_MS)),
                ),
              ),
            ),
          )
          .orderBy(asc(org.createdAt), asc(org.id))
          .limit(BATCH);
        for (const tenant of due) {
          const value = tenant.value ?? '';
          const status = await client.check({
            countryCode: value.slice(0, 2),
            vatNumber: value.slice(2),
          });
          await tx
            .update(org)
            .set({ taxIdStatus: status, taxIdCheckedAt: now })
            .where(eq(org.id, tenant.id));
          stats[status] = (stats[status] ?? 0) + 1;
        }
        return stats;
      });
    },
  };
}

export const job = makeTaxIdCheckJob(viesClient(env.VIES_URL));
