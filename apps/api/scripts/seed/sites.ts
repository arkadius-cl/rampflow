import { CreateLoadType, PutHours } from '@rampflow/shared/modules/booking/api.capacity';
import { Direction, DurationKind, ResourceKind } from '@rampflow/shared/modules/booking/values';
import { CreateDock, CreateSite } from '@rampflow/shared/modules/core/api.sites';
import { DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { OrgKind } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { DockId, SiteId, TenantId } from '../../src/db/ids.ts';
import type { Tx } from '../../src/db/scope.ts';
import { loadEntitlements } from '../../src/kernel/access.ts';
import { systemClock } from '../../src/kernel/clock.ts';
import { putHours } from '../../src/modules/booking/capacity/hours.ts';
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
import { site } from '../../src/modules/core/schema.ts';
import { createDock, createHall } from '../../src/modules/core/sites/docks.ts';
import { createSite } from '../../src/modules/core/sites/sites.ts';
import type { TenantRequest } from '../../src/modules/core/sites/tenant.ts';
import { findOrg, type SeedContext } from './context.ts';
import { ACME } from './core.ts';

// Acme's demo sites (docs/how-to/set-up-a-site.md), written through the module's own functions so
// they get the seeded load types and public holidays like a site created on screen. A site that
// already exists by name is left as it is.

interface DemoSite {
  site: CreateSite;
  halls: { name: string; docks: string[] }[];
  /** The default pool of `hall`, renamed; its other docks become `singles`. */
  pools: { hall: string; name: string; directions: Direction[] }[];
  singles: string[];
  /** `[weekday, opens, closes]` site rows. */
  hours: [number, string, string][];
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

const DEMO_SITES: readonly DemoSite[] = [
  {
    site: CreateSite.parse({
      name: 'Hamburg DC',
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
    hours: HAMBURG_HOURS,
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
    hours: BUCHAREST_HOURS,
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
  await putHours(
    tx,
    req.tenantId,
    PutHours.parse({ siteId, resourceId: null, rows: hoursRows(demo.hours) }),
  );
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

export async function seed(ctx: SeedContext): Promise<void> {
  const tenantId = (await findOrg(ctx.db, OrgKind.tenant, ACME)) as TenantId | null;
  if (!tenantId) throw new Error(`${ACME} is missing; the core seed runs first`);
  const tx = ctx.db as unknown as Tx;
  const entitlements = await loadEntitlements(tx, tenantId, new Date());
  const req: TenantRequest = { tenantId, userId: null, entitlements };
  for (const demo of DEMO_SITES) {
    if (await seedSite(tx, req, demo)) ctx.log(`created site ${demo.site.name}`);
  }
}
