import { randomBytes, randomUUID } from 'node:crypto';
import { LoadUnitType, ReferenceType } from '@rampflow/shared/modules/avis/values';
import {
  BookingEventType,
  BookingStatus,
  CarrierLinkSource,
  CarrierLinkStatus,
  CreatedParty,
  Direction,
  DurationKind,
  ResourceKind,
} from '@rampflow/shared/modules/booking/values';
import { DockStatus, DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { OrgKind, PackageId, Role, StaffLocale, TokenPurpose } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import {
  type BookingId,
  type CarrierId,
  type DockId,
  type HallId,
  hashToken,
  type OrgId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../src/db/ids.ts';
import { deriveToken } from '../src/kernel/tokens.ts';
import { avis, avisReference } from '../src/modules/avis/schema.ts';
import {
  bookableResource,
  type LoadTypeId,
  loadType,
  type ResourceId,
} from '../src/modules/booking/schema.resources.ts';
import { booking, bookingEvent } from '../src/modules/booking/schema.ts';
import {
  appUser,
  dock,
  hall,
  membership,
  membershipSite,
  org,
  session,
  site,
  tenantCarrierLink,
  tenantSubscription,
} from '../src/modules/core/schema.ts';
import { driverAccess } from '../src/modules/driver/schema.ts';
import { type OwnerDb, ownerDb } from './db.ts';

// The two-world fixture (delivery plan, "Shared files"): tenants A and B, two sites each, a
// carrier and a rival carrier linked to each tenant, a signed-in user per role, and one
// booking per (carrier, site) with avis and driver link. Seeded as the owner, past RLS.
// Units add module fixtures through a route case's `setup` or their own fixtures.ts.

export interface WorldUser {
  id: UserId;
  email: string;
  role: Role;
  /** The raw `rf_session` value. */
  sessionToken: string;
}

export interface WorldSite {
  id: SiteId;
  hallId: HallId;
  dockIds: readonly [DockId, DockId];
  resourceId: ResourceId;
  loadTypeId: LoadTypeId;
}

export interface WorldBooking {
  id: BookingId;
  siteId: SiteId;
  carrierId: CarrierId;
  code: string;
  /** The raw driver token; the `rf_driver` cookie value. */
  driverToken: string;
  driverAccessId: string;
}

export type TenantUserKey =
  | 'tenant_admin'
  | 'dispatcher'
  | 'gate_operator'
  | 'dock_operator'
  /** Operators limited to `sites[1]`, for the foreign-site check (TN-01). */
  | 'gate_operator_other_site'
  | 'dock_operator_other_site';
export type CarrierUserKey = 'carrier_admin' | 'carrier_user' | 'rival_admin' | 'rival_user';

export interface WorldSide {
  tenantId: TenantId;
  sites: readonly [WorldSite, WorldSite];
  /** Linked to this tenant; owns `bookings.own` and `bookings.otherSite`. */
  carrierId: CarrierId;
  /** A second carrier linked to the same tenant; owns `bookings.rival`. */
  rivalCarrierId: CarrierId;
  users: Record<TenantUserKey | CarrierUserKey, WorldUser>;
  bookings: { own: WorldBooking; rival: WorldBooking; otherSite: WorldBooking };
}

export interface World {
  platformOrgId: OrgId;
  platformAdmin: WorldUser;
  A: WorldSide;
  B: WorldSide;
}

/**
 * Tests pin their clocks anywhere from years before to years after the real date, so world
 * sessions are valid at every instant: a last-seen time in the future never counts as idle.
 */
const SESSIONS_VALID_UNTIL = new Date('2100-01-01T00:00:00Z');

/**
 * A fixed "now" before every world booking, while their driver links are valid, for tests that
 * need a plausible present rather than a particular date.
 */
export const WORLD_NOW = new Date('2026-10-19T08:00:00Z');

const uid = <T extends string>() => randomUUID() as T;
const suffix = () => randomBytes(4).toString('hex');

async function user(
  o: OwnerDb,
  orgId: OrgId,
  orgKind: OrgKind,
  role: Role,
  siteIds: readonly SiteId[] = [],
  tenantId?: TenantId,
): Promise<WorldUser> {
  const id = uid<UserId>();
  const email = `${role}-${suffix()}@world.test`;
  const sessionToken = randomBytes(32).toString('base64url');
  const now = new Date();
  await o.insert(appUser).values({
    id,
    email,
    name: `${role} ${suffix()}`,
    locale: StaffLocale.en,
    emailVerifiedAt: now,
  });
  const membershipId = uid<string>();
  await o
    .insert(membership)
    .values({ id: membershipId as never, userId: id, orgId, orgKind, role });
  for (const siteId of siteIds) {
    await o.insert(membershipSite).values({
      membershipId: membershipId as never,
      userId: id,
      siteId,
      tenantId: tenantId as TenantId,
    });
  }
  await o.insert(session).values({
    id: hashToken(sessionToken),
    userId: id,
    expiresAt: SESSIONS_VALID_UNTIL,
    lastSeenAt: SESSIONS_VALID_UNTIL,
  });
  return { id, email, role, sessionToken };
}

async function worldSite(o: OwnerDb, tenantId: TenantId, n: number): Promise<WorldSite> {
  const id = uid<SiteId>();
  await o.insert(site).values({
    id,
    tenantId,
    name: `Site ${n}`,
    addressLine1: 'Hafenstr. 1',
    postalCode: '20457',
    city: 'Hamburg',
    country: 'DE',
    subdivision: 'DE-HH',
    timeZone: 'Europe/Berlin',
    defaultLocale: 'de',
  });
  const hallId = uid<HallId>();
  await o.insert(hall).values({ id: hallId, tenantId, siteId: id, name: 'Hall 1' });
  const dockIds = [uid<DockId>(), uid<DockId>()] as const;
  for (const [i, dockId] of dockIds.entries()) {
    await o.insert(dock).values({
      id: dockId,
      tenantId,
      siteId: id,
      hallId,
      code: `D-0${i + 1}`,
      doorType: DoorType.dock_leveler,
      temperatureZone: TemperatureZone.ambient,
      status: DockStatus.active,
    });
  }
  const resourceId = uid<ResourceId>();
  await o.insert(bookableResource).values({
    id: resourceId,
    tenantId,
    siteId: id,
    kind: ResourceKind.pool,
    name: 'Ramp pool',
    directions: [Direction.inbound, Direction.outbound],
    capacityCap: 2,
  });
  const loadTypeId = uid<LoadTypeId>();
  await o.insert(loadType).values({
    id: loadTypeId,
    tenantId,
    siteId: id,
    name: { de: 'Palette', en: 'Pallets' },
    direction: Direction.inbound,
    duration: { kind: DurationKind.fixed, minutes: 30 },
  });
  return { id, hallId, dockIds, resourceId, loadTypeId };
}

async function worldBooking(
  o: OwnerDb,
  tenantId: TenantId,
  s: WorldSite,
  carrierId: CarrierId,
  startsAt: Date,
): Promise<WorldBooking> {
  const id = uid<BookingId>();
  const code = randomBytes(4).toString('hex').toUpperCase();
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  await o.insert(booking).values({
    id,
    tenantId,
    siteId: s.id,
    resourceId: s.resourceId,
    loadTypeId: s.loadTypeId,
    carrierId,
    carrierName: `Carrier ${carrierId.slice(0, 4)}`,
    code,
    status: BookingStatus.confirmed,
    direction: Direction.inbound,
    startsAt,
    endsAt,
    blocksUntil: endsAt,
    siteTimeZone: 'Europe/Berlin',
    loadUnits: 10,
    createdParty: CreatedParty.carrier,
  });
  await o.insert(avis).values({
    bookingId: id,
    tenantId,
    siteId: s.id,
    carrierId,
    counterpartyName: 'Supplier GmbH',
    loadUnits: [{ type: LoadUnitType.eur_pallet, quantity: 10 }],
    plate: `HH${code.slice(0, 4)}`,
    driverName: `Driver ${code}`,
  });
  await o.insert(avisReference).values({
    bookingId: id,
    tenantId,
    siteId: s.id,
    carrierId,
    type: ReferenceType.purchase_order,
    value: `PO-${code}`,
    valueNorm: `PO-${code}`,
  });
  await o.insert(bookingEvent).values({
    tenantId,
    siteId: s.id,
    bookingId: id,
    carrierId,
    type: BookingEventType.created,
    toStatus: 'confirmed',
    at: startsAt,
    actorParty: 'carrier',
  });
  const driverAccessId = randomUUID();
  const driverToken = deriveToken(TokenPurpose.driver, driverAccessId);
  await o.insert(driverAccess).values({
    id: driverAccessId as never,
    tenantId,
    siteId: s.id,
    bookingId: id,
    carrierId,
    tokenHash: hashToken(driverToken),
    channel: DriverChannel.link,
    expiresAt: new Date(startsAt.getTime() + 7 * 24 * 3600_000),
  });
  return { id, siteId: s.id, carrierId, code, driverToken, driverAccessId };
}

async function side(
  o: OwnerDb,
  label: string,
  pkg: PackageId,
  platformAdmin: UserId,
): Promise<WorldSide> {
  const tenantId = uid<TenantId>();
  const carrierId = uid<CarrierId>();
  const rivalCarrierId = uid<CarrierId>();
  await o.insert(org).values([
    {
      id: tenantId as string as OrgId,
      kind: OrgKind.tenant,
      name: `Tenant ${label} ${suffix()}`,
      // The world's tenants have docks, so they are past onboarding (ON-02).
      activatedAt: WORLD_NOW,
    },
    {
      id: carrierId as string as OrgId,
      kind: OrgKind.carrier,
      name: `Carrier ${label} ${suffix()}`,
      country: 'PL',
    },
    {
      id: rivalCarrierId as string as OrgId,
      kind: OrgKind.carrier,
      name: `Rival ${label} ${suffix()}`,
      country: 'DE',
    },
  ]);
  await o.insert(tenantSubscription).values({ tenantId, package: pkg, updatedBy: platformAdmin });
  const sites = [await worldSite(o, tenantId, 1), await worldSite(o, tenantId, 2)] as const;
  await o.insert(tenantCarrierLink).values([
    { tenantId, carrierId, status: CarrierLinkStatus.active, source: CarrierLinkSource.invitation },
    {
      tenantId,
      carrierId: rivalCarrierId,
      status: CarrierLinkStatus.active,
      source: CarrierLinkSource.invitation,
    },
  ]);
  const t = tenantId as string as OrgId;
  const c = carrierId as string as OrgId;
  const r = rivalCarrierId as string as OrgId;
  const users = {
    tenant_admin: await user(o, t, OrgKind.tenant, Role.tenant_admin),
    dispatcher: await user(o, t, OrgKind.tenant, Role.dispatcher),
    gate_operator: await user(o, t, OrgKind.tenant, Role.gate_operator, [sites[0].id], tenantId),
    dock_operator: await user(o, t, OrgKind.tenant, Role.dock_operator, [sites[0].id], tenantId),
    gate_operator_other_site: await user(
      o,
      t,
      OrgKind.tenant,
      Role.gate_operator,
      [sites[1].id],
      tenantId,
    ),
    dock_operator_other_site: await user(
      o,
      t,
      OrgKind.tenant,
      Role.dock_operator,
      [sites[1].id],
      tenantId,
    ),
    carrier_admin: await user(o, c, OrgKind.carrier, Role.carrier_admin),
    carrier_user: await user(o, c, OrgKind.carrier, Role.carrier_user),
    rival_admin: await user(o, r, OrgKind.carrier, Role.carrier_admin),
    rival_user: await user(o, r, OrgKind.carrier, Role.carrier_user),
  };
  const day = new Date(Date.UTC(2026, 10, 2, 8, 0));
  const bookings = {
    own: await worldBooking(o, tenantId, sites[0], carrierId, day),
    rival: await worldBooking(
      o,
      tenantId,
      sites[0],
      rivalCarrierId,
      new Date(day.getTime() + 3600_000),
    ),
    otherSite: await worldBooking(o, tenantId, sites[1], carrierId, day),
  };
  return { tenantId, sites, carrierId, rivalCarrierId, users, bookings };
}

/** The single platform org of this database, created on first use. */
async function platformOrg(o: OwnerDb): Promise<OrgId> {
  const id = uid<OrgId>();
  await o
    .insert(org)
    .values({ id, kind: OrgKind.platform, name: 'rampflow' })
    .onConflictDoNothing();
  const [row] = await o.select({ id: org.id }).from(org).where(eq(org.kind, 'platform'));
  if (!row) throw new Error('no platform org');
  return row.id as OrgId;
}

/** Seeds a fresh pair of worlds. Every test that needs tenants calls it; nothing is shared. */
export async function world(
  options: { packages?: { A?: PackageId; B?: PackageId } } = {},
): Promise<World> {
  const o = ownerDb();
  const platformOrgId = await platformOrg(o);
  const platformAdmin = await user(o, platformOrgId, OrgKind.platform, Role.platform_admin);
  return {
    platformOrgId,
    platformAdmin,
    A: await side(o, 'A', options.packages?.A ?? PackageId.pro, platformAdmin.id),
    B: await side(o, 'B', options.packages?.B ?? PackageId.pro, platformAdmin.id),
  };
}

export interface OnboardingTenant {
  tenantId: TenantId;
  users: Record<'tenant_admin' | 'dispatcher' | 'gate_operator', WorldUser>;
}

/** A tenant in onboarding (ON-01): no site, no hall, no dock, `activated_at` null. */
export async function onboardingTenant(pkg: PackageId = PackageId.pro): Promise<OnboardingTenant> {
  const o = ownerDb();
  const platformAdmin = await user(o, await platformOrg(o), OrgKind.platform, Role.platform_admin);
  const tenantId = uid<TenantId>();
  const t = tenantId as string as OrgId;
  await o.insert(org).values({ id: t, kind: OrgKind.tenant, name: `Onboarding ${suffix()}` });
  await o
    .insert(tenantSubscription)
    .values({ tenantId, package: pkg, updatedBy: platformAdmin.id });
  return {
    tenantId,
    users: {
      tenant_admin: await user(o, t, OrgKind.tenant, Role.tenant_admin),
      dispatcher: await user(o, t, OrgKind.tenant, Role.dispatcher),
      gate_operator: await user(o, t, OrgKind.tenant, Role.gate_operator),
    },
  };
}
