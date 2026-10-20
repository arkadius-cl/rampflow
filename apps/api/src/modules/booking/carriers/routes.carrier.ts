import type { LinkedTenant } from '@rampflow/shared/modules/booking/api.carriers';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { CarrierId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { tenantCarrierLink } from '../../core/schema.ts';
import { carrierRegistration } from '../schema.carriers.ts';
import { orgNames } from './links.ts';

/**
 * CR-02, CR-05: every tenant the carrier is linked to or registered at, with the link status and
 * the newest registration. Deactivated links stay listed, so the carrier sees why it cannot book.
 */
async function linkedTenants(tx: Tx, carrierId: CarrierId): Promise<LinkedTenant[]> {
  const links = await tx
    .select()
    .from(tenantCarrierLink)
    .where(eq(tenantCarrierLink.carrierId, carrierId));
  const registrations = await tx
    .select()
    .from(carrierRegistration)
    .where(eq(carrierRegistration.carrierId, carrierId))
    .orderBy(desc(carrierRegistration.createdAt));
  const tenantIds = [
    ...new Set([...links.map((l) => l.tenantId), ...registrations.map((r) => r.tenantId)]),
  ];
  const names = await orgNames(tx, tenantIds);
  return tenantIds
    .map((tenantId) => {
      const link = links.find((l) => l.tenantId === tenantId);
      const registration = registrations.find((r) => r.tenantId === tenantId);
      return {
        tenantId,
        name: names.get(tenantId)?.name ?? '',
        link: link
          ? {
              status: link.status,
              since: link.createdAt.toISOString(),
              deactivatedAt: link.deactivatedAt?.toISOString() ?? null,
            }
          : null,
        registration: registration
          ? {
              status: registration.status,
              rejectReason: registration.rejectReason,
              createdAt: registration.createdAt.toISOString(),
            }
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Mounted at `/api/c/:orgId/tenants` by modules/index.ts. */
export const carrier = new Hono<AppEnv>().get(
  '/',
  op({
    id: 'booking.carriers.listLinkedTenants',
    stories: ['CR-02', 'CR-05'],
    description:
      '`{ items }`: every tenant the carrier is linked to or registered at, with `link` (status, since) and the newest `registration` (status, reject reason)',
    responses: {},
  }),
  async (c) => {
    const { scope } = c.var;
    if (scope.party !== 'carrier') throw new Error(`carrier route under party ${scope.party}`);
    return c.json({ items: await linkedTenants(c.var.db, scope.carrierId) }, 200);
  },
);
