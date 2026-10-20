import { createHash } from 'node:crypto';
import { AvisInput } from '@rampflow/shared/modules/avis/avis';
import { LoadUnitType, ReferenceType, VehicleType } from '@rampflow/shared/modules/avis/values';
import { BookingParty, CreateMode } from '@rampflow/shared/modules/booking/values';
import {
  addDays,
  firstInstantFrom,
  type LocalTime,
  siteDay,
  type TimeZone,
} from '@rampflow/shared/time';
import { CarrierRole, DriverLocale, OrgKind, ScopeParty } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { CarrierId, SiteId, TenantId } from '../../src/db/ids.ts';
import type { Scope, Tx } from '../../src/db/scope.ts';
import { loadAccess } from '../../src/kernel/access.ts';
import { testClock } from '../../src/kernel/clock.ts';
import { createBooking } from '../../src/modules/booking/lifecycle/create.ts';
import { loadType } from '../../src/modules/booking/schema.resources.ts';
import { appUser, site } from '../../src/modules/core/schema.ts';
import { findOrg, type SeedContext } from './context.ts';
import { ACME, TRANS_POL } from './core.ts';

// A few Trans-Pol bookings at Acme's "Lager Hamburg" in the coming days, booked through the
// portal's carrier mode, so the carrier's list, detail, driver link and "Book again" have data.
// Idempotent per day: the clientRequestId derives from the site-local date and the slot.

const SITE = 'Lager Hamburg';
const CARRIER_ADMIN = 'admin@trans-pol.local';

const PLAN: { inDays: number; at: string; units: number; plate: string }[] = [
  { inDays: 1, at: '08:00', units: 26, plate: 'PO 4KX19' },
  { inDays: 2, at: '10:30', units: 33, plate: 'PO 7GH02' },
  { inDays: 3, at: '14:00', units: 12, plate: 'WA 1234K' },
];

function requestId(name: string): string {
  const h = createHash('sha256').update(`seed:portal:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function seed(ctx: SeedContext): Promise<void> {
  const tenantId = (await findOrg(ctx.db, OrgKind.tenant, ACME)) as TenantId | null;
  const carrierId = (await findOrg(ctx.db, OrgKind.carrier, TRANS_POL)) as CarrierId | null;
  if (!tenantId || !carrierId) throw new Error('run the core seed first');
  const [s] = await ctx.db
    .select({ id: site.id, timeZone: site.timeZone })
    .from(site)
    .where(and(eq(site.tenantId, tenantId), eq(site.name, SITE)));
  const [user] = await ctx.db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, CARRIER_ADMIN));
  if (!s || !user) throw new Error('run the core and booking seeds first');
  const [palletised] = await ctx.db
    .select({ id: loadType.id })
    .from(loadType)
    .where(and(eq(loadType.siteId, s.id), eq(loadType.sort, 1)));
  if (!palletised) throw new Error(`no load type at ${SITE}`);

  const tx = ctx.db as unknown as Tx;
  const zone = s.timeZone as TimeZone;
  const now = new Date();
  const scope: Scope = {
    party: ScopeParty.carrier_at_tenant,
    carrierId,
    tenantId,
    userId: user.id,
    role: CarrierRole.carrier_admin,
  };
  const bookingContext = {
    tx,
    tenantId,
    actor: { party: BookingParty.carrier, userId: user.id, carrierId },
    access: await loadAccess(tx, scope, testClock(now)),
    now,
  };
  let created = 0;
  for (const p of PLAN) {
    const day = addDays(siteDay(now, zone), p.inDays);
    const result = await createBooking(bookingContext, {
      mode: CreateMode.carrier,
      clientRequestId: requestId(`${day}:${p.at}`),
      siteId: s.id as SiteId,
      loadTypeId: palletised.id,
      startsAt: firstInstantFrom(day, p.at as LocalTime, zone),
      avis: AvisInput.parse({
        references: [
          { type: ReferenceType.purchase_order, value: `PO-${day.replaceAll('-', '')}-TP` },
        ],
        counterpartyName: 'Elektro Nord AG',
        loadUnits: [{ type: LoadUnitType.eur_pallet, quantity: p.units }],
        vehicle: { type: VehicleType.semi_trailer, plate: p.plate, plateCountry: 'PL' },
        driver: { name: 'Tomasz Wiśniewski', phone: '+48 600 100 200', locale: DriverLocale.pl },
      }),
    });
    if (result.created) created++;
  }
  ctx.log(created > 0 ? `${created} Trans-Pol bookings ahead` : 'Trans-Pol bookings exist');
}
