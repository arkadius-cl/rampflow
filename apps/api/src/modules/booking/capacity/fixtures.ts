import { randomBytes, randomUUID } from 'node:crypto';
import {
  BookingStatus,
  Direction,
  DurationKind,
  type LoadStatus,
  ResourceKind,
} from '@rampflow/shared/modules/booking/values';
import type { TimeZone } from '@rampflow/shared/time';
import { ScopeParty, TenantActorKind, TenantRole } from '@rampflow/shared/values';
import { type OwnerDb, ownerDb } from '../../../../test/db.ts';
import type { WorldSide } from '../../../../test/world.ts';
import type { BookingId, DockId, HallId, SiteId, TenantId } from '../../../db/ids.ts';
import { type Scope, type Tx, withScope } from '../../../db/scope.ts';
import { type Access, loadAccess } from '../../../kernel/access.ts';
import { testClock } from '../../../kernel/clock.ts';
import { dock, hall, site } from '../../core/schema.ts';
import {
  bookableResource,
  type LoadTypeId,
  loadType,
  loadTypeResource,
  openingHours,
  type ResourceId,
  resourceDock,
} from '../schema.resources.ts';
import { booking } from '../schema.ts';

// Capacity fixtures, written as the owner: a site in a chosen zone with docks, one resource,
// one fixed-duration load type linked to it, weekly hours, and bookings placed at instants.

export interface CapacitySite {
  tenantId: TenantId;
  siteId: SiteId;
  zone: TimeZone;
  dockIds: DockId[];
  resourceId: ResourceId;
  loadTypeId: LoadTypeId;
}

export interface CapacitySiteOptions {
  zone?: string;
  subdivision?: string | null;
  docks?: number;
  kind?: 'pool' | 'single';
  capacityCap?: number | null;
  dailyCap?: number | null;
  /** `[weekday, opens, closes]` site rows. */
  hours: [number, string, string][];
  minutes?: number;
  buffer?: number;
}

export async function capacitySite(
  tenantId: TenantId,
  o: CapacitySiteOptions,
  db: OwnerDb = ownerDb(),
): Promise<CapacitySite> {
  const siteId = randomUUID() as SiteId;
  const zone = (o.zone ?? 'Europe/Berlin') as TimeZone;
  await db.insert(site).values({
    id: siteId,
    tenantId,
    name: `Capacity ${siteId.slice(0, 6)}`,
    addressLine1: 'Am Hafen 1',
    postalCode: '20457',
    city: 'Hamburg',
    country: 'DE',
    subdivision: o.subdivision === undefined ? 'DE-HH' : o.subdivision,
    timeZone: zone,
    defaultLocale: 'de',
  });
  const hallId = randomUUID() as HallId;
  await db.insert(hall).values({ id: hallId, tenantId, siteId, name: 'Halle 1' });
  const dockIds = Array.from({ length: o.docks ?? 1 }, () => randomUUID() as DockId);
  for (const [i, id] of dockIds.entries()) {
    await db.insert(dock).values({
      id,
      tenantId,
      siteId,
      hallId,
      code: `D-${i + 1}`,
      doorType: 'dock_leveler',
      temperatureZone: 'ambient',
      status: 'active',
    });
  }
  const kind = o.kind ?? ResourceKind.pool;
  const [resource] = await db
    .insert(bookableResource)
    .values({
      tenantId,
      siteId,
      kind,
      name: 'Rampe',
      directions: [Direction.inbound, Direction.outbound],
      capacityCap: o.capacityCap ?? null,
      dailyCap: o.dailyCap ?? null,
    })
    .returning();
  if (!resource) throw new Error('no resource');
  await db.insert(resourceDock).values(
    dockIds.map((dockId) => ({
      dockId,
      resourceId: resource.id,
      resourceKind: kind,
      siteId,
      tenantId,
    })),
  );
  const [lt] = await db
    .insert(loadType)
    .values({
      tenantId,
      siteId,
      name: { de: 'Paletten', en: 'Pallets' },
      direction: 'inbound',
      duration: { kind: DurationKind.fixed, minutes: o.minutes ?? 60 },
      bufferMinutes: o.buffer ?? 0,
    })
    .returning();
  if (!lt) throw new Error('no load type');
  await db
    .insert(loadTypeResource)
    .values({ loadTypeId: lt.id, resourceId: resource.id, siteId, tenantId });
  if (o.hours.length > 0) {
    await db
      .insert(openingHours)
      .values(
        o.hours.map(([weekday, opens, closes]) => ({ tenantId, siteId, weekday, opens, closes })),
      );
  }
  return { tenantId, siteId, zone, dockIds, resourceId: resource.id, loadTypeId: lt.id };
}

/** An active booking on the fixture's resource that blocks `[startsAt, startsAt + minutes)`. */
export async function placeBooking(
  s: CapacitySite,
  startsAt: Date,
  minutes: number,
  status: LoadStatus | 'cancelled' = BookingStatus.confirmed,
): Promise<BookingId> {
  const end = new Date(startsAt.getTime() + minutes * 60_000);
  const [row] = await ownerDb()
    .insert(booking)
    .values({
      tenantId: s.tenantId,
      siteId: s.siteId,
      resourceId: s.resourceId,
      loadTypeId: s.loadTypeId,
      carrierName: 'Spedition Test',
      code: randomBytes(4).toString('hex').toUpperCase(),
      status,
      direction: 'inbound',
      startsAt,
      endsAt: end,
      blocksUntil: end,
      siteTimeZone: s.zone,
      loadUnits: 10,
      createdParty: 'staff',
    })
    .returning({ id: booking.id });
  if (!row) throw new Error('no booking');
  return row.id;
}

/** Runs `fn` as side's tenant admin with the request's `Access`, like a handler. */
export function asTenantAdmin<T>(
  side: WorldSide,
  fn: (tx: Tx, access: Access) => Promise<T>,
  now = new Date('2026-10-19T08:00:00Z'),
): Promise<T> {
  const scope: Scope = {
    party: ScopeParty.tenant,
    tenantId: side.tenantId,
    siteIds: 'all',
    actor: {
      kind: TenantActorKind.user,
      userId: side.users.tenant_admin.id,
      role: TenantRole.tenant_admin,
    },
  };
  return withScope(scope, async (tx) => fn(tx, await loadAccess(tx, scope, testClock(now))));
}
