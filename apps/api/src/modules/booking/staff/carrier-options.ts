import type { CarrierOption } from '@rampflow/shared/modules/booking/api.staff';
import { and, eq } from 'drizzle-orm';
import type { CarrierId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { tenantCarrierLink } from '../../core/schema.ts';
import { carrierNames } from '../lifecycle/elevated.ts';

const MAX_OPTIONS = 50;

/** BK-02: the tenant's actively linked carriers whose name contains `q`, by name. */
export async function carrierOptions(
  tx: Tx,
  tenantId: TenantId,
  q: string | undefined,
): Promise<CarrierOption[]> {
  const links = await tx
    .select({ carrierId: tenantCarrierLink.carrierId })
    .from(tenantCarrierLink)
    .where(and(eq(tenantCarrierLink.tenantId, tenantId), eq(tenantCarrierLink.status, 'active')));
  const names = await carrierNames(
    tx,
    links.map((l) => l.carrierId as CarrierId),
  );
  const needle = q?.toLocaleLowerCase();
  return [...names]
    .map(([id, name]) => ({ id, name }))
    .filter((c) => !needle || c.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_OPTIONS);
}
