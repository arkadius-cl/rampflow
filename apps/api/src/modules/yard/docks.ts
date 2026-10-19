import { DOCK_HOLDING_STATUSES } from '@rampflow/shared/modules/booking/lifecycle';
import type { DocksView, YardDock } from '@rampflow/shared/modules/yard/api';
import type { TimeZone } from '@rampflow/shared/time';
import { and, asc, eq } from 'drizzle-orm';
import { resourceDock } from '../booking/schema.resources.ts';
import { dock, hall } from '../core/schema.ts';
import { requireSite } from '../core/sites/sites.ts';
import { onSiteTrucks, type YardScope } from './trucks.ts';

// YD-06: the docks of a site grouped by hall with the truck each one holds, next to the queue of
// checked-in trucks by slot start. Inactive docks are left out; maintenance docks show.

const HOLDING = new Set<string>(DOCK_HOLDING_STATUSES);

export async function docksView(s: YardScope): Promise<DocksView> {
  const site = await requireSite(s.tx, s.tenantId, s.siteId);
  const rows = await s.tx
    .select({
      hallId: hall.id,
      hallName: hall.name,
      id: dock.id,
      code: dock.code,
      status: dock.status,
      temperatureZone: dock.temperatureZone,
      adrAllowed: dock.adrAllowed,
      resourceId: resourceDock.resourceId,
    })
    .from(dock)
    .innerJoin(hall, eq(hall.id, dock.hallId))
    .leftJoin(resourceDock, eq(resourceDock.dockId, dock.id))
    .where(and(eq(dock.tenantId, s.tenantId), eq(dock.siteId, s.siteId)))
    .orderBy(asc(hall.sort), asc(hall.name), asc(dock.sort), asc(dock.code));
  const onSite = await onSiteTrucks(s);
  const halls = new Map<string, DocksView['halls'][number]>();
  for (const r of rows) {
    if (r.status === 'inactive') continue;
    const group = halls.get(r.hallId) ?? { id: r.hallId, name: r.hallName, docks: [] };
    halls.set(r.hallId, group);
    const occupant = onSite.items.find((t) => t.dock?.id === r.id && HOLDING.has(t.status)) ?? null;
    const entry: YardDock = {
      id: r.id,
      code: r.code,
      status: r.status,
      temperatureZone: r.temperatureZone,
      adrAllowed: r.adrAllowed,
      resourceId: r.resourceId,
      occupant,
    };
    group.docks.push(entry);
  }
  return {
    siteId: s.siteId,
    timeZone: site.timeZone as TimeZone,
    halls: [...halls.values()],
    queue: onSite.items
      .filter((t) => t.status === 'checked_in')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id)),
  };
}
