import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AnyOrgId } from '../../src/db/ids.ts';
import { type OrgKind, org } from '../../src/modules/core/schema.ts';

type OwnerTx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** What every seed module receives. `db` is the seed's transaction as the owner role. */
export interface SeedContext {
  db: OwnerTx;
  log(line: string): void;
}

/** The first org of `kind` named `name`, or `null`. Seeds create orgs only through this lookup. */
export async function findOrg(
  db: SeedContext['db'],
  kind: OrgKind,
  name: string,
): Promise<AnyOrgId | null> {
  const [row] = await db
    .select({ id: org.id })
    .from(org)
    .where(and(eq(org.kind, kind), eq(org.name, name)))
    .orderBy(asc(org.createdAt))
    .limit(1);
  return row?.id ?? null;
}
