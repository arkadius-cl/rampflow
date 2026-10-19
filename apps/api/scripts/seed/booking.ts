import { createHash } from 'node:crypto';
import { AvisInput } from '@rampflow/shared/modules/avis/avis';
import type { CommandInput } from '@rampflow/shared/modules/booking/lifecycle';
import { siteDay, type TimeZone } from '@rampflow/shared/time';
import { and, eq } from 'drizzle-orm';
import type { BookingId, CarrierId, DockId, SiteId, TenantId, UserId } from '../../src/db/ids.ts';
import type { Scope, TenantRole, Tx } from '../../src/db/scope.ts';
import { loadAccess } from '../../src/kernel/access.ts';
import { testClock } from '../../src/kernel/clock.ts';
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

const SITE = 'Lager Hamburg';
const ZONE = 'Europe/Berlin' as TimeZone;
const MINUTE = 60_000;

type Role = Extract<TenantRole, 'dispatcher' | 'gate_operator' | 'dock_operator'>;
const ACCOUNTS: Record<Role, string> = {
  dispatcher: 'dispatch@acme.local',
  gate_operator: 'gate@acme.local',
  dock_operator: 'dock@acme.local',
};

interface Step {
  /** Minutes from the current grid slot. */
  at: number;
  as: Role | 'system';
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

/** The day: one visit per state, earliest first. Dock commands name docks by code. */
function visits(): Visit[] {
  const gate = (at: number, command: CommandInput): Step => ({ at, as: 'gate_operator', command });
  const dockOp = (at: number, command: CommandInput): Step => ({
    at,
    as: 'dock_operator',
    command,
  });
  const call = (at: number, n: number) => dockOp(at, { type: 'call', dockId: dockStep(n) });
  return [
    {
      start: -240,
      carrier: 'Spedition Müller',
      units: 12,
      plate: 'HH-SM 401',
      steps: [{ at: -180, as: 'system', command: { type: 'mark_no_show' } }],
    },
    {
      start: -180,
      carrier: 'transpol',
      units: 26,
      plate: 'PO 4KX19',
      steps: [
        gate(-188, { type: 'check_in' }),
        call(-178, 1),
        dockOp(-174, { type: 'dock' }),
        dockOp(-170, { type: 'start_loading' }),
        dockOp(-125, { type: 'complete', actualLoadUnits: 26 }),
        gate(-115, { type: 'depart' }),
      ],
    },
    {
      start: -120,
      carrier: 'Kraft Logistik',
      units: 18,
      plate: 'B-KL 2210',
      steps: [
        gate(-112, { type: 'check_in' }),
        call(-104, 2),
        dockOp(-100, { type: 'dock' }),
        dockOp(-55, {
          type: 'complete',
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
        gate(-64, { type: 'check_in' }),
        call(-55, 3),
        dockOp(-50, { type: 'dock' }),
        dockOp(-45, { type: 'start_loading' }),
      ],
    },
    {
      start: -30,
      carrier: 'Nordfracht GmbH',
      units: 10,
      plate: 'HB-NF 77',
      steps: [gate(-14, { type: 'check_in' }), call(-8, 4), dockOp(-3, { type: 'dock' })],
    },
    {
      start: 0,
      carrier: 'transpol',
      units: 20,
      plate: 'WA 1234K',
      steps: [gate(-12, { type: 'check_in' }), call(-2, 5)],
    },
    {
      start: 0,
      carrier: 'Unangemeldet KG',
      units: 6,
      plate: 'HH-UK 12',
      walkIn: true,
      steps: [],
    },
    {
      start: 30,
      carrier: 'Kraft Logistik',
      units: 8,
      plate: 'B-KL 3301',
      steps: [gate(-4, { type: 'check_in' })],
    },
    { start: 60, carrier: 'transpol', units: 30, plate: 'PO 2LM88', steps: [] },
    { start: 90, carrier: 'Spedition Müller', units: 14, plate: 'HH-SM 409', steps: [] },
    {
      start: 120,
      carrier: 'Nordfracht GmbH',
      units: 4,
      plate: 'HB-NF 81',
      steps: [
        { at: -30, as: 'dispatcher', command: { type: 'cancel', reason: 'Ware nicht fertig' } },
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
      locale: 'de',
      driverName,
      channel: 'link',
      score: 100,
      attempts: 1,
      completedAt: new Date(ctx.now.getTime() - 5 * MINUTE),
      validityDays: await validityDays(ctx.access, siteId),
    });
    await transitionBooking(ctx, booking.id as BookingId, {
      type: 'link_acknowledgement',
      acknowledgementId: ack.id,
      via: 'completed',
    });
  }
}

/** A UUID derived from a name, so a second run on the same day finds the same requests. */
function requestId(name: string): string {
  const h = createHash('sha256').update(`seed:booking:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
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
        doorType: 'dock_leveler' as const,
        temperatureZone: 'ambient' as const,
        status: 'active' as const,
        sort: n,
      })),
    )
    .returning({ id: dock.id });
  const [pool] = await db
    .insert(bookableResource)
    .values({
      tenantId,
      siteId,
      kind: 'pool',
      name: 'Rampen 1–6',
      directions: ['inbound', 'outbound'],
    })
    .returning({ id: bookableResource.id });
  await db.insert(resourceDock).values(
    docks.map((d) => ({
      dockId: d.id,
      resourceId: pool?.id as never,
      resourceKind: 'pool' as const,
      siteId,
      tenantId,
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

export async function seed(ctx: SeedContext): Promise<void> {
  const tenantId = (await findOrg(ctx.db, 'tenant', ACME)) as TenantId | null;
  const transpol = (await findOrg(ctx.db, 'carrier', TRANS_POL)) as CarrierId | null;
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
  const context = async (as: Role | 'system', now: Date): Promise<BookingContext> => {
    const scope: Scope =
      as === 'system'
        ? { party: 'tenant', tenantId, siteIds: 'all', actor: { kind: 'system', job: 'no_show' } }
        : {
            party: 'tenant',
            tenantId,
            siteIds: 'all',
            actor: { kind: 'user', userId: users[as], role: as },
          };
    const actor =
      as === 'system'
        ? ({ party: 'system', job: 'no_show' } as const)
        : ({ party: 'staff', userId: users[as] } as const);
    return { tx, tenantId, actor, access: await loadAccess(tx, scope, testClock(now)), now };
  };

  const now = new Date();
  const slot = new Date(Math.floor(now.getTime() / (30 * MINUTE)) * 30 * MINUTE);
  const at = (minutes: number) => new Date(slot.getTime() + minutes * MINUTE);
  const day = siteDay(slot, ZONE);
  let created = 0;
  for (const [i, v] of visits().entries()) {
    const avis = AvisInput.parse({
      references: [{ type: 'purchase_order', value: `PO-${day.replaceAll('-', '')}-${i + 1}` }],
      counterpartyName: v.start % 60 === 0 ? 'Elektro Nord AG' : 'Möbelhaus Süd GmbH',
      loadUnits: [{ type: 'eur_pallet', quantity: v.units }],
      vehicle: { type: 'semi_trailer', plate: v.plate },
    });
    const carrier = v.carrier === 'transpol' ? { id: transpol } : { name: v.carrier };
    const base = {
      clientRequestId: requestId(`${day}:${i}`),
      siteId,
      loadTypeId: palletised?.id as LoadTypeId,
      carrier,
    };
    const request: CreateBookingRequest = v.walkIn
      ? { ...base, mode: 'walk_in', plateSeen: v.plate, outcome: { kind: 'check_in', avis } }
      : { ...base, mode: 'staff', startsAt: at(v.start), avis };
    const createdAt = v.walkIn ? at(-6) : at(Math.min(v.start, 0) - 24 * 60);
    const result = await createBooking(
      await context(v.walkIn ? 'gate_operator' : 'dispatcher', createdAt),
      request,
    );
    if (!result.created) continue;
    created++;
    for (const step of v.steps) {
      if (step.command.type === 'check_in') {
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
