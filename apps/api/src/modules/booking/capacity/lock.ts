import { sql } from 'drizzle-orm';
import type { SiteId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';

/**
 * Serializes every capacity-checking write of one site until the transaction ends (ADR-0004),
 * and every master data write that must keep each dock bookable (ADR-0017). The only caller of
 * `pg_advisory_xact_lock` for capacity; take it before reading load or memberships.
 */
export async function lockSiteCapacity(tx: Tx, siteId: SiteId): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`capacity:${siteId}`}, 0))`);
}
