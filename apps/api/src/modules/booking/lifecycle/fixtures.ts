import { randomUUID } from 'node:crypto';
import type { AvisInput } from '@rampflow/shared/modules/avis/avis';
import type { BookingStatus } from '@rampflow/shared/modules/booking/lifecycle';
import { and, eq } from 'drizzle-orm';
import { type OwnerDb, ownerDb } from '../../../../test/db.ts';
import type { WorldSide, WorldUser } from '../../../../test/world.ts';
import {
  type BookingId,
  type CarrierId,
  type DockId,
  hashToken,
  type TenantId,
  type UserId,
  wrapJson,
} from '../../../db/ids.ts';
import {
  type CarrierRole,
  type Scope,
  type TenantRole,
  type Tx,
  withScope,
} from '../../../db/scope.ts';
import { loadAccess } from '../../../kernel/access.ts';
import { testClock } from '../../../kernel/clock.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { avis } from '../../avis/schema.ts';
import { settingValue } from '../../core/schema.ts';
import { driverAccess } from '../../driver/schema.ts';
import type { CapacitySite } from '../capacity/fixtures.ts';
import { loadTypeResource, openingHours, resourceDock } from '../schema.resources.ts';
import { booking, bookingEvent } from '../schema.ts';
import type { BookingContext } from './context.ts';
import { bookingCode } from './create.ts';
import type { BookingRow } from './notify.ts';

// Test fixtures of the booking lifecycle, written as the owner like test/world.ts.

/** Makes site 0 of a world side bookable: both docks in its pool, open as `hours` says. */
export async function bookableSite(
  side: WorldSide,
  db: OwnerDb = ownerDb(),
  hours: [number, string, string][] = [1, 2, 3, 4, 5, 6, 7].map((d) => [d, '00:00', '24:00']),
): Promise<void> {
  const s = side.sites[0];
  await db.insert(resourceDock).values(
    s.dockIds.map((dockId) => ({
      dockId,
      resourceId: s.resourceId,
      resourceKind: 'pool' as const,
      siteId: s.id,
      tenantId: side.tenantId,
    })),
  );
  await db.insert(openingHours).values(
    hours.map(([weekday, opens, closes]) => ({
      tenantId: side.tenantId,
      siteId: s.id,
      weekday,
      opens,
      closes,
    })),
  );
  await db.insert(loadTypeResource).values({
    loadTypeId: s.loadTypeId,
    resourceId: s.resourceId,
    siteId: s.id,
    tenantId: side.tenantId,
  });
}

export function setSetting(
  tenantId: TenantId,
  key: string,
  value: unknown,
  by: UserId,
  siteId: string | null = null,
) {
  return ownerDb()
    .insert(settingValue)
    .values({ tenantId, siteId: siteId as never, key, value: wrapJson(value), updatedBy: by });
}

export function clearSetting(tenantId: TenantId, key: string) {
  return ownerDb()
    .delete(settingValue)
    .where(and(eq(settingValue.tenantId, tenantId), eq(settingValue.key, key)));
}

export const avisInput = (o: Partial<AvisInput> = {}): AvisInput => ({
  references: [{ type: 'purchase_order', value: 'PO-4711' }],
  counterpartyName: 'Lieferant GmbH',
  loadUnits: [{ type: 'eur_pallet', quantity: 10 }],
  ...o,
});

/**
 * Runs `fn` with a booking context as `user` of the side's tenant at `now`, the way a request
 * does: one scoped transaction, access loaded inside it. Operators see site 0 only.
 */
export function asStaff<T>(
  side: WorldSide,
  user: WorldUser,
  now: Date,
  fn: (ctx: BookingContext) => Promise<T>,
): Promise<T> {
  const siteLimited = user.role === 'gate_operator' || user.role === 'dock_operator';
  const scope: Scope = {
    party: 'tenant',
    tenantId: side.tenantId,
    siteIds: siteLimited ? [side.sites[0].id] : 'all',
    actor: { kind: 'user', userId: user.id, role: user.role as TenantRole },
  };
  return withScope(scope, async (tx: Tx) =>
    fn({
      tx,
      tenantId: side.tenantId,
      actor: { party: 'staff', userId: user.id },
      access: await loadAccess(tx, scope, testClock(now)),
      now,
    }),
  );
}

/** The no-show job's context: the tenant scope with a system actor. */
export function asSystem<T>(
  side: WorldSide,
  now: Date,
  fn: (ctx: BookingContext) => Promise<T>,
): Promise<T> {
  const scope: Scope = {
    party: 'tenant',
    tenantId: side.tenantId,
    siteIds: 'all',
    actor: { kind: 'system', job: 'no_show' },
  };
  return withScope(scope, async (tx) =>
    fn({
      tx,
      tenantId: side.tenantId,
      actor: { party: 'system', job: 'no_show' },
      access: await loadAccess(tx, scope, testClock(now)),
      now,
    }),
  );
}

/** Runs `fn` as a carrier user at the tenant (`carrier_at_tenant`), as the portal will (U8). */
export function asCarrier<T>(
  side: WorldSide,
  user: WorldUser,
  now: Date,
  fn: (ctx: BookingContext) => Promise<T>,
): Promise<T> {
  const scope: Scope = {
    party: 'carrier_at_tenant',
    carrierId: side.carrierId,
    tenantId: side.tenantId,
    userId: user.id,
    role: user.role as CarrierRole,
  };
  return withScope(scope, async (tx) =>
    fn({
      tx,
      tenantId: side.tenantId,
      actor: { party: 'carrier', userId: user.id, carrierId: side.carrierId },
      access: await loadAccess(tx, scope, testClock(now)),
      now,
    }),
  );
}

export interface SeedBooking {
  startsAt: Date;
  status?: BookingStatus;
  minutes?: number;
  dockId?: DockId | null;
  site?: CapacitySite;
  carrierId?: CarrierId | null;
  createdParty?: 'carrier' | 'staff';
  createdBy?: UserId | null;
  walkIn?: boolean;
  noShowAt?: Date | null;
}

/**
 * A booking with avis and driver link, as the owner: on site 0 of the side's world (or on a
 * capacity fixture site), in any status. Dock-holding statuses need `dockId`.
 */
export async function seedBooking(side: WorldSide, o: SeedBooking): Promise<BookingRow> {
  const db = ownerDb();
  const at = o.site
    ? {
        siteId: o.site.siteId,
        resourceId: o.site.resourceId,
        loadTypeId: o.site.loadTypeId,
        zone: o.site.zone as string,
      }
    : {
        siteId: side.sites[0].id,
        resourceId: side.sites[0].resourceId,
        loadTypeId: side.sites[0].loadTypeId,
        zone: 'Europe/Berlin',
      };
  const endsAt = new Date(o.startsAt.getTime() + (o.minutes ?? 30) * 60_000);
  const carrierId = o.carrierId === undefined ? side.carrierId : o.carrierId;
  const [row] = await db
    .insert(booking)
    .values({
      tenantId: side.tenantId,
      siteId: at.siteId,
      resourceId: at.resourceId,
      loadTypeId: at.loadTypeId,
      carrierId,
      carrierName: 'Spedition Nowak',
      code: bookingCode(),
      status: o.status ?? 'confirmed',
      direction: 'inbound',
      startsAt: o.startsAt,
      endsAt,
      blocksUntil: endsAt,
      siteTimeZone: at.zone,
      loadUnits: 10,
      createdParty: o.createdParty ?? 'staff',
      createdBy: o.createdBy ?? null,
      walkIn: o.walkIn ?? false,
      dockId: o.dockId ?? null,
      noShowAt: o.noShowAt ?? null,
    })
    .returning();
  if (!row) throw new Error('no booking');
  await db.insert(avis).values({
    bookingId: row.id,
    tenantId: side.tenantId,
    siteId: at.siteId,
    carrierId,
    counterpartyName: 'Lieferant GmbH',
    loadUnits: [{ type: 'eur_pallet', quantity: 10 }],
  });
  const linkId = randomUUID();
  await db.insert(driverAccess).values({
    id: linkId as never,
    tenantId: side.tenantId,
    siteId: at.siteId,
    bookingId: row.id,
    carrierId,
    tokenHash: hashToken(deriveToken('driver', linkId)),
    channel: 'link',
    expiresAt: new Date(o.startsAt.getTime() + 7 * 86_400_000),
  });
  return row;
}

export const eventsOf = (bookingId: BookingId) =>
  ownerDb()
    .select()
    .from(bookingEvent)
    .where(eq(bookingEvent.bookingId, bookingId))
    .orderBy(bookingEvent.at, bookingEvent.id);

export async function bookingRow(bookingId: BookingId): Promise<BookingRow> {
  const [row] = await ownerDb().select().from(booking).where(eq(booking.id, bookingId));
  if (!row) throw new Error(`no booking ${bookingId}`);
  return row;
}
