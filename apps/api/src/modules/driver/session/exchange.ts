import { and, eq, gt, isNull } from 'drizzle-orm';
import { hashToken } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { driverAccess } from '../schema.ts';

/**
 * DR-01: the unrevoked, unexpired `driver_access` row of a link token, touched as used. Runs
 * under the token's scope, so an unknown token simply finds nothing.
 */
export async function exchangeDriverToken(
  tx: Tx,
  token: string,
  now: Date,
): Promise<{ expiresAt: Date } | null> {
  const [row] = await tx
    .update(driverAccess)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(driverAccess.tokenHash, hashToken(token)),
        isNull(driverAccess.revokedAt),
        gt(driverAccess.expiresAt, now),
      ),
    )
    .returning({ expiresAt: driverAccess.expiresAt });
  return row ?? null;
}
