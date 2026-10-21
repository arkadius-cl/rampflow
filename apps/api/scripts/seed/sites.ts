import { CreateLoadType } from '@rampflow/shared/modules/booking/api.capacity';
import { Direction, DurationKind, ResourceKind } from '@rampflow/shared/modules/booking/values';
import { CreateDock, CreateSite, hoursTemplateRows } from '@rampflow/shared/modules/core/api.sites';
import { DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { OrgKind, Setting, SettingScope } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { DockId, SiteId, TenantId, UserId } from '../../src/db/ids.ts';
import type { Tx } from '../../src/db/scope.ts';
import { loadEntitlements } from '../../src/kernel/access.ts';
import { systemClock } from '../../src/kernel/clock.ts';
import {
  createLoadType,
  listLoadTypes,
  putLoadTypeResources,
} from '../../src/modules/booking/capacity/load-types.ts';
import {
  bookDock,
  listResources,
  updateResource,
} from '../../src/modules/booking/capacity/resources.ts';
import type { LoadTypeId, ResourceId } from '../../src/modules/booking/schema.resources.ts';
import { appUser, dock, hall, site } from '../../src/modules/core/schema.ts';
import { writeSetting } from '../../src/modules/core/settings/settings.ts';
import { createDock, createHall } from '../../src/modules/core/sites/docks.ts';
import { createSite } from '../../src/modules/core/sites/sites.ts';
import type { TenantRequest } from '../../src/modules/core/sites/tenant.ts';
import { findOrg, type SeedContext } from './context.ts';
import { ACME } from './core.ts';
import { NORDHAFEN } from './signups.ts';

// Acme's demo sites (docs/how-to/set-up-a-site.md) and Nordhafen's first site, written through the
// module's own functions so they get the seeded load types, public holidays and default pools like
// a site created on screen. A site that already exists by name is left as it is.

interface DemoSite {
  site: CreateSite;
  halls: { name: string; docks: string[] }[];
  /** The default pool of `hall`, renamed; its other docks become `singles`. */
  pools: { hall: string; name: string; directions: Direction[] }[];
  singles: string[];
}

const weekdays = (opens: string, closes: string) =>
  [1, 2, 3, 4, 5].map((d): [number, string, string] => [d, opens, closes]);
const hoursRows = (hours: [number, string, string][]) =>
  hours.map(([weekday, opens, closes]) => ({ weekday, opens, closes }));
const HAMBURG_HOURS: [number, string, string][] = [
  ...weekdays('06:00', '22:00'),
  [6, '06:00', '14:00'],
];
const BUCHAREST_HOURS = weekdays('07:00', '19:00');

export const HAMBURG_DC = 'Hamburg DC';

const DEMO_SITES: readonly DemoSite[] = [
  {
    site: CreateSite.parse({
      name: HAMBURG_DC,
      addressLine1: 'Am Ballinkai 1',
      postalCode: '21129',
      city: 'Hamburg',
      country: 'DE',
      subdivision: 'DE-HH',
      timeZone: 'Europe/Berlin',
      defaultLocale: 'de',
      phone: '+4940123456',
      hours: hoursRows(HAMBURG_HOURS),
    }),
    halls: [
      { name: 'Halle 1', docks: ['T01', 'T02', 'T03', 'T04', 'T05'] },
      { name: 'Halle 2', docks: ['T06', 'T07', 'T08'] },
    ],
    pools: [
      { hall: 'Halle 1', name: 'Wareneingang', directions: [Direction.inbound] },
      { hall: 'Halle 2', name: 'Versand', directions: [Direction.outbound] },
    ],
    singles: ['T05', 'T08'],
  },
  {
    site: CreateSite.parse({
      name: 'Bucharest',
      addressLine1: 'Bulevardul Theodor Pallady 51',
      postalCode: '032258',
      city: 'Bucharest',
      country: 'RO',
      subdivision: 'RO-B',
      timeZone: 'Europe/Bucharest',
      defaultLocale: 'en',
      hours: hoursRows(BUCHAREST_HOURS),
    }),
    halls: [{ name: 'Hall A', docks: ['R1', 'R2'] }],
    pools: [{ hall: 'Hall A', name: 'Ramps', directions: [Direction.inbound, Direction.outbound] }],
    singles: [],
  },
];

async function seedSite(tx: Tx, req: TenantRequest, demo: DemoSite): Promise<boolean> {
  const [existing] = await tx
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.tenantId, req.tenantId), eq(site.name, demo.site.name)));
  if (existing) return false;
  // The demo sites lie in EU countries, which `core.site_countries` admits by default.
  const row = await createSite(tx, req, systemClock, demo.site, [demo.site.country]);
  const siteId = row.id as SiteId;
  const dockIds = new Map<string, DockId>();
  const hallIds = new Map<string, string>();
  for (const [sort, h] of demo.halls.entries()) {
    const hall = await createHall(tx, req.tenantId, siteId, { name: h.name, sort });
    hallIds.set(h.name, hall.id);
    for (const [i, code] of h.docks.entries()) {
      const input = CreateDock.parse({
        hallId: hall.id,
        code,
        doorType: DoorType.dock_leveler,
        temperatureZone: TemperatureZone.ambient,
        sort: i,
      });
      dockIds.set(code, (await createDock(tx, req, systemClock, siteId, input)).id as DockId);
    }
  }
  // `createDock` put every dock into its hall's default pool (ADR-0017); the demo renames those.
  const defaults = await listResources(tx, req.tenantId, siteId);
  for (const [sort, p] of demo.pools.entries()) {
    const pool = defaults.find((r) => r.hallId === hallIds.get(p.hall));
    if (!pool) throw new Error(`no default pool for ${p.hall}`);
    await updateResource(tx, req, pool.id as ResourceId, {
      name: p.name,
      directions: p.directions,
      sort,
    });
  }
  for (const code of demo.singles) {
    await bookDock(tx, req, dockIds.get(code) as DockId, {
      as: ResourceKind.single,
      directions: [Direction.inbound, Direction.outbound],
    });
  }
  const resources = await listResources(tx, req.tenantId, siteId);
  const serving = (d: Direction) =>
    resources.filter((r) => r.directions.includes(d)).map((r) => r.id);
  // Outbound first: narrowing the inbound types must leave every pool a load type (ADR-0017).
  const outbound = await createLoadType(
    tx,
    req,
    CreateLoadType.parse({
      siteId,
      name: { de: 'Palettiert (Versand)', en: 'Palletised (outbound)' },
      direction: Direction.outbound,
      duration: { kind: DurationKind.fixed, minutes: 60 },
      bufferMinutes: 10,
      resourceIds: serving(Direction.outbound),
    }),
  );
  for (const lt of await listLoadTypes(tx, req.tenantId, siteId)) {
    if (lt.id === outbound.id) continue;
    await putLoadTypeResources(tx, req.tenantId, lt.id as LoadTypeId, serving(lt.direction));
  }
  return true;
}

/** A frozen dock, which gets its own default pool and shows "Bookable for" (ADR-0017). */
const FROZEN_DOCK = { site: HAMBURG_DC, hall: 'Halle 2', code: 'T09', sort: 3 } as const;

/** Ensured on every run, so a database seeded before 03 also shows a second dock profile. */
async function ensureFrozenDock(tx: Tx, req: TenantRequest): Promise<boolean> {
  const [h] = await tx
    .select({ siteId: site.id, hallId: hall.id, dockId: dock.id })
    .from(site)
    .innerJoin(hall, and(eq(hall.siteId, site.id), eq(hall.name, FROZEN_DOCK.hall)))
    .leftJoin(dock, and(eq(dock.siteId, site.id), eq(dock.code, FROZEN_DOCK.code)))
    .where(and(eq(site.tenantId, req.tenantId), eq(site.name, FROZEN_DOCK.site)));
  if (!h || h.dockId) return false;
  const input = CreateDock.parse({
    hallId: h.hallId,
    code: FROZEN_DOCK.code,
    doorType: DoorType.dock_leveler,
    temperatureZone: TemperatureZone.frozen,
    adrAllowed: false,
    sort: FROZEN_DOCK.sort,
  });
  await createDock(tx, req, systemClock, h.siteId as SiteId, input);
  return true;
}

const BREMERHAVEN = CreateSite.parse({
  name: 'Bremerhaven',
  addressLine1: 'Am Seedeich 40',
  postalCode: '27572',
  city: 'Bremerhaven',
  country: 'DE',
  subdivision: 'DE-HB',
  timeZone: 'Europe/Berlin',
  defaultLocale: 'de',
  hours: hoursTemplateRows.one_shift,
});
const BREMERHAVEN_HALL = 'Halle 1';

/**
 * Nordhafen halfway through onboarding: a site and a hall, never a dock, so it stays in
 * onboarding on every run (ON-01).
 */
async function seedNordhafen(ctx: SeedContext, tx: Tx): Promise<void> {
  const tenantId = (await findOrg(ctx.db, OrgKind.tenant, NORDHAFEN)) as TenantId | null;
  if (!tenantId) {
    ctx.log(`${NORDHAFEN} is missing; skipped its site (the signups seed creates it)`);
    return;
  }
  let [s] = await tx
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.tenantId, tenantId), eq(site.name, BREMERHAVEN.name)));
  if (!s) {
    const entitlements = await loadEntitlements(tx, tenantId, new Date());
    const req: TenantRequest = { tenantId, userId: null, entitlements };
    s = await createSite(tx, req, systemClock, BREMERHAVEN, [BREMERHAVEN.country]);
    ctx.log(`created site ${BREMERHAVEN.name} of ${NORDHAFEN}`);
  }
  const siteId = s.id as SiteId;
  const [h] = await tx
    .select({ id: hall.id })
    .from(hall)
    .where(and(eq(hall.siteId, siteId), eq(hall.name, BREMERHAVEN_HALL)));
  if (!h) await createHall(tx, tenantId, siteId, { name: BREMERHAVEN_HALL, sort: 0 });
}

/** Hamburg DC's own slot grid, next to the platform and Acme overrides of core.ts (change 06). */
export const HAMBURG_SLOT_GRID_MINUTES = 15;

async function seedHamburgSlotGrid(tx: Tx, req: TenantRequest): Promise<void> {
  const [hamburg] = await tx
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.tenantId, req.tenantId), eq(site.name, HAMBURG_DC)));
  const [admin] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, 'admin@acme.local'));
  if (!hamburg || !admin) throw new Error('Hamburg DC or admin@acme.local is missing');
  await writeSetting(
    tx,
    { scope: SettingScope.site, tenantId: req.tenantId, siteId: hamburg.id as SiteId },
    req.entitlements,
    { key: Setting.booking.slot_grid_minutes, value: HAMBURG_SLOT_GRID_MINUTES },
    admin.id as UserId,
    new Date(),
  );
}

export async function seed(ctx: SeedContext): Promise<void> {
  const tenantId = (await findOrg(ctx.db, OrgKind.tenant, ACME)) as TenantId | null;
  if (!tenantId) throw new Error(`${ACME} is missing; the core seed runs first`);
  const tx = ctx.db as unknown as Tx;
  const entitlements = await loadEntitlements(tx, tenantId, new Date());
  const req: TenantRequest = { tenantId, userId: null, entitlements };
  for (const demo of DEMO_SITES) {
    if (await seedSite(tx, req, demo)) ctx.log(`created site ${demo.site.name}`);
  }
  if (await ensureFrozenDock(tx, req)) ctx.log(`created dock ${FROZEN_DOCK.code}`);
  await seedHamburgSlotGrid(tx, req);
  await seedNordhafen(ctx, tx);
}
