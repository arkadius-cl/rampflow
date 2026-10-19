import { sql } from 'drizzle-orm';
import type { SiteId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';

/**
 * Serializes every capacity-checking write of one site until the transaction ends (ADR-0004).
 * The only caller of `pg_advisory_xact_lock` for capacity; take it once, before reading load.
 */
export async function lockSiteCapacity(tx: Tx, siteId: SiteId): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`capacity:${siteId}`}, 0))`);
}
