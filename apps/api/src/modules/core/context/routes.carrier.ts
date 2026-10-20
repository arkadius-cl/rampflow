import type { Role } from '@rampflow/shared';
import {
  type CarrierContext,
  type CarrierContextTenant,
  logoPath,
} from '@rampflow/shared/modules/core/api.context';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { TenantId } from '../../../db/ids.ts';
import { loadAccess } from '../../../kernel/access.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { tenantLogo } from '../../brand/schema.ts';
import { org, tenantCarrierLink } from '../schema.ts';

// GET /api/c/:orgId/context: the carrier org, the caller's permissions and every linked tenant,
// including deactivated links so old bookings stay reachable (ADR-0002, carrier party).

export const carrier = new Hono<AppEnv>().get(
  '/',
  op({
    id: 'core.context.getCarrierContext',
    stories: [],
    description:
      'The carrier context of the signed-in member: org, role, permissions and linked tenants.',
    responses: { 200: type<CarrierContext>() },
  }),
  async (c) => {
    const { scope, access, db, clock } = c.var;
    if (scope.party !== 'carrier' || !access.role) throw new Error('context runs under a carrier');
    const [named] = await db
      .select({ id: org.id, name: org.name })
      .from(org)
      .where(eq(org.id, scope.carrierId));
    const links = await db
      .select({ id: tenantCarrierLink.tenantId, name: org.name, status: tenantCarrierLink.status })
      .from(tenantCarrierLink)
      .innerJoin(org, eq(org.id, tenantCarrierLink.tenantId))
      .where(eq(tenantCarrierLink.carrierId, scope.carrierId))
      .orderBy(asc(org.name));
    const logos = new Map(
      (
        await db
          .select({ tenantId: tenantLogo.tenantId, sha256: tenantLogo.sha256 })
          .from(tenantLogo)
      ).map((l) => [l.tenantId, l.sha256.toString('hex')]),
    );

    const tenants: CarrierContextTenant[] = [];
    for (const link of links) {
      // What this carrier may use at the tenant follows the tenant's entitlements, resolved as
      // the kernel does for the carrier-at-tenant party.
      const atTenant = await loadAccess(
        db,
        { ...scope, party: 'carrier_at_tenant', tenantId: link.id as TenantId },
        clock,
      );
      const on = atTenant.entitlements;
      const logo = logos.get(link.id as TenantId);
      tenants.push({
        id: link.id,
        name: link.name,
        linkStatus: link.status,
        carrierPortal: Boolean(on?.modules.booking && on.features['booking.carrier_portal']),
        logoUrl:
          logo && on?.modules.brand && on.features['brand.logo'] ? logoPath(link.id, logo) : null,
      });
    }

    const body: CarrierContext = {
      org: { id: scope.carrierId, name: named?.name ?? '' },
      role: access.role as Role,
      permissions: [...access.permissions],
      tenants,
    };
    return c.json(body, 200);
  },
);
