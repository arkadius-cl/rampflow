import { createHash } from 'node:crypto';
import { AvisInput } from '@rampflow/shared/modules/avis/avis';
import { LoadUnitType, ReferenceType, VehicleType } from '@rampflow/shared/modules/avis/values';
import type { CommandInput } from '@rampflow/shared/modules/booking/lifecycle';
import {
  BookingParty,
  CarrierLinkStatus,
  CommandName,
  CreateMode,
  Direction,
  LinkVia,
  OnSiteStatus,
  ResourceKind,
  WalkInOutcome,
} from '@rampflow/shared/modules/booking/values';
import { DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { addDays, type LocalDate, siteDay, type TimeZone } from '@rampflow/shared/time';
import {
  DriverLocale,
  OrgKind,
  ScopeParty,
  SeedActor,
  SeedOrg,
  SystemActorName,
  TenantActorKind,
  values,
} from '@rampflow/shared/values';
import { and, eq, inArray } from 'drizzle-orm';
import type { BookingId, CarrierId, DockId, SiteId, TenantId, UserId } from '../../src/db/ids.ts';
import type { Scope, Tx } from '../../src/db/scope.ts';
import { loadAccess } from '../../src/kernel/access.ts';
import { type Clock, systemClock, testClock } from '../../src/kernel/clock.ts';
import { seedLoadTypes } from '../../src/modules/booking/capacity/load-types.ts';
import type { BookingContext } from '../../src/modules/booking/lifecycle/context.ts';
import {
  type CreateBookingRequest,
  createBooking,
} from '../../src/modules/booking/lifecycle/create.ts';
import { transitionBooking } from '../../src/modules/booking/lifecycle/transition.ts';
import {
  bookableResource,
  type LoadTypeId,
  loadType,
  loadTypeResource,
  openingHours,
  resourceDock,
} from '../../src/modules/booking/schema.resources.ts';
import { booking } from '../../src/modules/booking/schema.ts';
import { appUser, dock, hall, site } from '../../src/modules/core/schema.ts';
import { applicableInstructions } from '../../src/modules/safety/authoring/published.ts';
import {
  recordAcknowledgement,
  validityDays,
} from '../../src/modules/safety/register/acknowledgements.ts';
import { findOrg, type SeedContext } from './context.ts';
import { ACME, TRANS_POL } from './core.ts';

// A demo day for Acme at "Lager Hamburg": bookings around the current time in every state of the
// visit, created and moved through createBooking and transitionBooking like real requests.
// Idempotent per site-local day: a booking whose deterministic clientRequestId exists is skipped.
// Earlier demo days leave through the lifecycle before today's trucks reuse their docks.

const SITE = 'Lager Hamburg';
const ZONE = 'Europe/Berlin' as TimeZone;
const MINUTE = 60_000;

type Role = Exclude<SeedActor, typeof SeedActor.system>;
const ACCOUNTS: Record<Role, string> = {
  dispatcher: 'dispatch@acme.local',
  gate_operator: 'gate@acme.local',
  dock_operator: 'dock@acme.local',
};

interface Step {
  /** Minutes from the current grid slot. */
  at: number;
  as: SeedActor;
  command: CommandInput;
}

interface Visit {
  /** Slot start in minutes from the current grid slot. */
  start: number;
  carrier: 'transpol' | string;
  units: number;
  plate: string;
  walkIn?: boolean;
  steps: Step[];
}

const dockStep = (dockNo: number) => `D-0${dockNo}`;
/** The profile of every Lager Hamburg dock, its pool and memberships. */
const STANDARD = {
  doorType: DoorType.dock_leveler,
  temperatureZone: TemperatureZone.ambient,
  adrAllowed: false,
} as const;

/** The day: one visit per state, earliest first. Dock commands name docks by code. */
function visits(): Visit[] {
  const gate = (at: number, command: CommandInput): Step => ({
    at,
    as: SeedActor.gate_operator,
    command,
  });
  const dockOp = (at: number, command: CommandInput): Step => ({
    at,
    as: SeedActor.dock_operator,
    command,
  });
  const call = (at: number, n: number) =>
    dockOp(at, { type: CommandName.call, dockId: dockStep(n) });
  return [
    {
      start: -240,
      carrier: 'Spedition Müller',
      units: 12,
      plate: 'HH-SM 401',
      steps: [{ at: -180, as: SeedActor.system, command: { type: CommandName.mark_no_show } }],
    },
    {
      start: -180,
      carrier: 'transpol',
      units: 26,
      plate: 'PO 4KX19',
      steps: [
        gate(-188, { type: CommandName.check_in }),
        call(-178, 1),
        dockOp(-174, { type: CommandName.dock }),
        dockOp(-170, { type: CommandName.start_loading }),
        dockOp(-125, { type: CommandName.complete, actualLoadUnits: 26 }),
        gate(-115, { type: CommandName.depart }),
      ],
    },
    {
      start: -120,
      carrier: 'Kraft Logistik',
      units: 18,
      plate: 'B-KL 2210',
      steps: [
        gate(-112, { type: CommandName.check_in }),
        call(-104, 2),
        dockOp(-100, { type: CommandName.dock }),
        dockOp(-55, {
          type: CommandName.complete,
          actualLoadUnits: 17,
          discrepancyNote: '1 Palette beschädigt',
        }),
      ],
    },
    {
      start: -60,
      carrier: 'transpol',
      units: 33,
      plate: 'PO 7GH02',
      steps: [
        gate(-64, { type: CommandName.check_in }),
        call(-55, 3),
        dockOp(-50, { type: CommandName.dock }),
        dockOp(-45, { type: CommandName.start_loading }),
      ],
    },
    {
      start: -30,
      carrier: 'Nordfracht GmbH',
      units: 10,
      plate: 'HB-NF 77',
      steps: [
        gate(-14, { type: CommandName.check_in }),
        call(-8, 4),
        dockOp(-3, { type: CommandName.dock }),
      ],
    },
    {
      start: 0,
      carrier: 'transpol',
      units: 20,
      plate: 'WA 1234K',
      steps: [gate(-12, { type: CommandName.check_in }), call(-2, 5)],
    },
    {
      start: 0,
      carrier: 'Unangemeldet KG',
      units: 6,
      plate: 'HH-UK 12',
      walkIn: true,
      // Gate enforcement keeps the walk-in confirmed until the driver's briefing is linked.
      steps: [gate(-5, { type: CommandName.check_in })],
    },
    {
      start: 30,
      carrier: 'Kraft Logistik',
      units: 8,
      plate: 'B-KL 3301',
      steps: [gate(-4, { type: CommandName.check_in })],
    },
    { start: 60, carrier: 'transpol', units: 30, plate: 'PO 2LM88', steps: [] },
    { start: 90, carrier: 'Spedition Müller', units: 14, plate: 'HH-SM 409', steps: [] },
    {
      start: 120,
      carrier: 'Nordfracht GmbH',
      units: 4,
      plate: 'HB-NF 81',
      steps: [
        {
          at: -30,
          as: SeedActor.dispatcher,
          command: { type: CommandName.cancel, reason: 'Ware nicht fertig' },
        },
      ],
    },
    { start: 150, carrier: 'transpol', units: 24, plate: 'PO 9TT31', steps: [] },
  ];
}

const DRIVERS = ['Tomasz Wiśniewski', 'Jörg Albers', 'Marek Nowak', 'Hauke Jensen', 'Ion Popescu'];

/**
 * The driver completes every briefing of the site before a check-in, as on the driver link, so
 * safety enforcement lets the demo trucks in once the safety seed has published a briefing.
 */
async function briefDriver(
  ctx: BookingContext,
  booking: { id: string; siteId: string; carrierId: string | null },
  driverName: string,
): Promise<void> {
  const siteId = booking.siteId as SiteId;
  const instructions = await applicableInstructions(ctx.tx, { tenantId: ctx.tenantId, siteId });
  for (const { instructionId } of instructions) {
    const ack = await recordAcknowledgement(ctx.tx, {
      tenantId: ctx.tenantId,
      bookingId: booking.id as BookingId,
      carrierId: booking.carrierId as CarrierId | null,
      instructionId,
      locale: DriverLocale.de,
      driverName,
      channel: DriverChannel.link,
      score: 100,
      attempts: 1,
      completedAt: new Date(ctx.now.getTime() - 5 * MINUTE),
      validityDays: await validityDays(ctx.access, siteId),
    });
    await transitionBooking(ctx, booking.id as BookingId, {
      type: CommandName.link_acknowledgement,
      acknowledgementId: ack.id,
      via: LinkVia.completed,
    });
  }
}

/** A UUID derived from a name, so a second run on the same day finds the same requests. */
function requestId(name: string): string {
  const h = createHash('sha256').update(`seed:booking:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function departEarlierDemoVisits(
  ctx: BookingContext,
  siteId: SiteId,
  day: LocalDate,
  users: Record<Role, UserId>,
): Promise<void> {
  const rows = await ctx.tx
    .select({
      id: booking.id,
      startsAt: booking.startsAt,
      clientRequestId: booking.clientRequestId,
      createdBy: booking.createdBy,
    })
    .from(booking)
    .where(
      and(
        eq(booking.tenantId, ctx.tenantId),
        eq(booking.siteId, siteId),
        inArray(booking.status, values(OnSiteStatus)),
      ),
    );
  const plan = visits();
  for (const row of rows) {
    // The relative demo slots can start either side of their request's local date.
    const startsDay = siteDay(row.startsAt, ZONE);
    const days = [addDays(startsDay, -1), startsDay, addDays(startsDay, 1)];
    const earlierDemo = days.some(
      (d) =>
        d < day &&
        plan.some(
          (v, i) =>
            row.clientRequestId === requestId(`${d}:${i}`) &&
            row.createdBy === (v.walkIn ? users.gate_operator : users.dispatcher),
        ),
    );
    if (earlierDemo) {
      await transitionBooking(ctx, row.id, {
        type: CommandName.depart,
        reason: 'Dev seed: close an earlier demo day',
      });
    }
  }
}

async function ensureSite(ctx: SeedContext, tenantId: TenantId) {
  const db = ctx.db;
  const [existing] = await db
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.tenantId, tenantId), eq(site.name, SITE)));
  if (existing) return existing.id as SiteId;
  const [s] = await db
    .insert(site)
    .values({
      tenantId,
      name: SITE,
      addressLine1: 'Am Sandtorkai 12',
      postalCode: '20457',
      city: 'Hamburg',
      country: 'DE',
      subdivision: 'DE-HH',
      timeZone: ZONE,
      defaultLocale: 'de',
      phone: '+49 40 3000 100',
    })
    .returning({ id: site.id });
  const siteId = s?.id as SiteId;
  const [h] = await db
    .insert(hall)
    .values({ tenantId, siteId, name: 'Halle 1' })
    .returning({ id: hall.id });
  const docks = await db
    .insert(dock)
    .values(
      [1, 2, 3, 4, 5, 6].map((n) => ({
        tenantId,
        siteId,
        hallId: h?.id as string,
        code: dockStep(n),
        ...STANDARD,
        status: CarrierLinkStatus.active,
        sort: n,
      })),
    )
    .returning({ id: dock.id });
  const [pool] = await db
    .insert(bookableResource)
    .values({
      tenantId,
      siteId,
      kind: ResourceKind.pool,
      name: 'Rampen 1–6',
      // The hall's default pool for the standard profile (ADR-0017).
      hallId: h?.id as string,
      ...STANDARD,
      directions: [Direction.inbound, Direction.outbound],
    })
    .returning({ id: bookableResource.id });
  await db.insert(resourceDock).values(
    docks.map((d) => ({
      dockId: d.id,
      resourceId: pool?.id as never,
      resourceKind: ResourceKind.pool,
      siteId,
      tenantId,
      ...STANDARD,
    })),
  );
  // A 24/7 site, so the demo day works whenever the seed runs.
  await db.insert(openingHours).values(
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      tenantId,
      siteId,
      weekday,
      opens: '00:00',
      closes: '24:00',
    })),
  );
  await seedLoadTypes(db as unknown as Tx, { id: siteId, tenantId });
  const types = await db
    .select({ id: loadType.id })
    .from(loadType)
    .where(eq(loadType.siteId, siteId));
  await db
    .insert(loadTypeResource)
    .values(
      types.map((t) => ({ loadTypeId: t.id, resourceId: pool?.id as never, siteId, tenantId })),
    );
  ctx.log(`created site ${SITE} with 6 docks`);
  return siteId;
}

async function userId(ctx: SeedContext, email: string): Promise<UserId> {
  const [row] = await ctx.db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email));
  if (!row) throw new Error(`run the core seed first: ${email} is missing`);
  return row.id;
}

export async function seed(ctx: SeedContext, clock: Clock = systemClock): Promise<void> {
  const tenantId = (await findOrg(ctx.db, OrgKind.tenant, ACME)) as TenantId | null;
  const transpol = (await findOrg(ctx.db, OrgKind.carrier, TRANS_POL)) as CarrierId | null;
  if (!tenantId || !transpol) throw new Error('run the core seed first');
  const siteId = await ensureSite(ctx, tenantId);
  const [palletised] = await ctx.db
    .select({ id: loadType.id })
    .from(loadType)
    .where(and(eq(loadType.siteId, siteId), eq(loadType.sort, 1)));
  const docks = await ctx.db
    .select({ id: dock.id, code: dock.code })
    .from(dock)
    .where(eq(dock.siteId, siteId));
  const dockId = (code: string) => docks.find((d) => d.code === code)?.id as DockId;
  const users: Record<Role, UserId> = {
    dispatcher: await userId(ctx, ACCOUNTS.dispatcher),
    gate_operator: await userId(ctx, ACCOUNTS.gate_operator),
    dock_operator: await userId(ctx, ACCOUNTS.dock_operator),
  };
  const tx = ctx.db as unknown as Tx;
  const context = async (as: SeedActor, now: Date): Promise<BookingContext> => {
    const scope: Scope =
      as === SeedActor.system
        ? {
            party: ScopeParty.tenant,
            tenantId,
            siteIds: 'all',
            actor: { kind: TenantActorKind.system, job: SystemActorName.no_show },
          }
        : {
            party: ScopeParty.tenant,
            tenantId,
            siteIds: 'all',
            actor: { kind: TenantActorKind.user, userId: users[as], role: as },
          };
    const actor =
      as === SeedActor.system
        ? ({ party: BookingParty.system, job: SystemActorName.no_show } as const)
        : ({ party: BookingParty.staff, userId: users[as] } as const);
    return { tx, tenantId, actor, access: await loadAccess(tx, scope, testClock(now)), now };
  };

  const now = clock.now();
  const slot = new Date(Math.floor(now.getTime() / (30 * MINUTE)) * 30 * MINUTE);
  const at = (minutes: number) => new Date(slot.getTime() + minutes * MINUTE);
  const day = siteDay(slot, ZONE);
  await departEarlierDemoVisits(await context(SeedActor.gate_operator, now), siteId, day, users);
  let created = 0;
  for (const [i, v] of visits().entries()) {
    const avis = AvisInput.parse({
      references: [
        { type: ReferenceType.purchase_order, value: `PO-${day.replaceAll('-', '')}-${i + 1}` },
      ],
      counterpartyName: v.start % 60 === 0 ? 'Elektro Nord AG' : 'Möbelhaus Süd GmbH',
      loadUnits: [{ type: LoadUnitType.eur_pallet, quantity: v.units }],
      vehicle: { type: VehicleType.semi_trailer, plate: v.plate },
    });
    const carrier = v.carrier === SeedOrg.transpol ? { id: transpol } : { name: v.carrier };
    const base = {
      clientRequestId: requestId(`${day}:${i}`),
      siteId,
      loadTypeId: palletised?.id as LoadTypeId,
      carrier,
    };
    const request: CreateBookingRequest = v.walkIn
      ? {
          ...base,
          mode: CreateMode.walk_in,
          plateSeen: v.plate,
          outcome: { kind: WalkInOutcome.check_in, avis },
        }
      : { ...base, mode: CreateMode.staff, startsAt: at(v.start), avis };
    const createdAt = v.walkIn ? at(-6) : at(Math.min(v.start, 0) - 24 * 60);
    const result = await createBooking(
      await context(v.walkIn ? SeedActor.gate_operator : SeedActor.dispatcher, createdAt),
      request,
    );
    if (!result.created) continue;
    created++;
    for (const step of v.steps) {
      if (step.command.type === CommandName.check_in) {
        const driver = DRIVERS[i % DRIVERS.length] as string;
        await briefDriver(await context(step.as, at(step.at)), result.booking, driver);
      }
      const command =
        'dockId' in step.command && typeof step.command.dockId === 'string'
          ? { ...step.command, dockId: dockId(step.command.dockId) }
          : step.command;
      await transitionBooking(await context(step.as, at(step.at)), result.booking.id, command);
    }
  }
  ctx.log(
    created > 0 ? `${created} bookings on ${day} at ${SITE}` : `bookings of ${day} already exist`,
  );
}
