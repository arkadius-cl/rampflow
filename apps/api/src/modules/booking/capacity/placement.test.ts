import { Direction, ResourceKind } from '@rampflow/shared/modules/booking/values';
import { CreateDock } from '@rampflow/shared/modules/core/api.sites';
import { DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { ErrorCode, SqlState, StaffLocale } from '@rampflow/shared/values';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { type World, world } from '../../../../test/world.ts';
import type { DockId, HallId, SiteId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { testClock } from '../../../kernel/clock.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { dock } from '../../core/schema.ts';
import { createDock, createHall, updateDock } from '../../core/sites/docks.ts';
import type { TenantRequest } from '../../core/sites/tenant.ts';
import {
  type LoadTypeId,
  loadTypeResource,
  type ResourceId,
  resourceDock,
} from '../schema.resources.ts';
import { asTenantRequest, serviceSite } from './fixtures.ts';
import { listLoadTypes, putLoadTypeResources, updateLoadType } from './load-types.ts';
import { bookDock, createResource, listResources, putResourceDocks } from './resources.ts';

let w: World;
beforeAll(async () => {
  w = await world();
});

const resources = (siteId: SiteId) =>
  asTenantRequest(w.A, (tx, req) => listResources(tx, req.tenantId, siteId));
const holding = async (siteId: SiteId, dockId: string) =>
  (await resources(siteId)).find((r) => r.dockIds.includes(dockId));

/** The SQLSTATE of a rejected statement, looking through Drizzle's wrapper. */
async function sqlState(statement: Promise<unknown>): Promise<string | undefined> {
  try {
    await statement;
  } catch (e) {
    for (let cur = e; cur && typeof cur === 'object'; cur = (cur as { cause?: unknown }).cause) {
      if ('code' in cur && typeof cur.code === 'string') return cur.code;
    }
    throw e;
  }
  return undefined;
}

describe('MD-02 a new dock joins the default pool of its hall and profile', () => {
  it('builds "Halle 1" from the first dock with the site load types, and adds the second', async () => {
    const s = await serviceSite(w.A, [
      { code: 'T01', hall: 'Halle 1' },
      { code: 'T02', hall: 'Halle 1' },
    ]);
    const list = await resources(s.siteId);
    expect(list).toHaveLength(1);
    const [pool] = list;
    expect(pool).toMatchObject({
      name: 'Halle 1',
      kind: ResourceKind.pool,
      directions: [Direction.inbound, Direction.outbound],
      hallId: s.halls['Halle 1'],
      doorType: DoorType.dock_leveler,
      temperatureZone: TemperatureZone.ambient,
      adrAllowed: false,
      dockIds: [s.docks.T01, s.docks.T02].sort(),
    });
    expect(pool?.loadTypeIds).toHaveLength(3);
  });

  it('gives a frozen dock in a de site its own pool "Halle 2 · Tiefkühl"', async () => {
    const s = await serviceSite(
      w.A,
      [
        { code: 'T08', hall: 'Halle 2' },
        { code: 'T09', hall: 'Halle 2', temperatureZone: TemperatureZone.frozen },
      ],
      { locale: StaffLocale.de },
    );
    const frozen = await holding(s.siteId, s.docks.T09 as string);
    expect(frozen).toMatchObject({
      name: 'Halle 2 · Tiefkühl',
      temperatureZone: TemperatureZone.frozen,
      hallId: s.halls['Halle 2'],
      dockIds: [s.docks.T09],
    });
    expect((await holding(s.siteId, s.docks.T08 as string))?.name).toBe('Halle 2');
  });

  it('names attributes off the standard profile in the site locale, zone first', async () => {
    const s = await serviceSite(
      w.A,
      [{ code: 'A1', hall: 'Hall A', doorType: DoorType.ground_level, adrAllowed: true }],
      { locale: StaffLocale.en },
    );
    expect((await holding(s.siteId, s.docks.A1 as string))?.name).toBe(
      'Hall A · Ground level · ADR',
    );
  });

  it('makes a single named after the code when booking.pools is off', async () => {
    const s = await serviceSite(w.A, [{ code: 'D-01', hall: 'Halle 1' }], { pools: false });
    const [single] = await resources(s.siteId);
    expect(single).toMatchObject({
      name: 'D-01',
      kind: ResourceKind.single,
      hallId: null,
      dockIds: [s.docks['D-01']],
    });
    expect(single?.loadTypeIds).toHaveLength(3);
  });

  it('links a default pool without an active load type to the site load types', async () => {
    const s = await serviceSite(w.A, [{ code: 'T01', hall: 'Halle 1' }]);
    const pool = await holding(s.siteId, s.docks.T01 as string);
    await ownerDb()
      .delete(loadTypeResource)
      .where(eq(loadTypeResource.resourceId, pool?.id as never));
    await asTenantRequest(w.A, (tx, req) =>
      createDock(
        tx,
        req,
        testClock(new Date()),
        s.siteId,
        CreateDock.parse({
          hallId: s.halls['Halle 1'],
          code: 'T02',
          doorType: DoorType.dock_leveler,
          temperatureZone: TemperatureZone.ambient,
        }),
      ),
    );
    const after = await holding(s.siteId, s.docks.T01 as string);
    expect(after?.id).toBe(pool?.id);
    expect(after?.loadTypeIds).toHaveLength(3);
  });

  it('puts two concurrent first docks of one hall into one default pool', async () => {
    const s = await serviceSite(w.A, []);
    const hallId = (
      await asTenantRequest(w.A, (tx, req) =>
        createHall(tx, req.tenantId, s.siteId, { name: 'Halle 1' }),
      )
    ).id as HallId;
    const add = (code: string) =>
      asTenantRequest(w.A, (tx, req) =>
        createDock(
          tx,
          req,
          testClock(new Date()),
          s.siteId,
          CreateDock.parse({
            hallId,
            code,
            doorType: DoorType.dock_leveler,
            temperatureZone: TemperatureZone.ambient,
          }),
        ),
      );
    const [a, b] = await Promise.all([add('T01'), add('T02')]);
    const list = await resources(s.siteId);
    expect(list.map((r) => ({ hallId: r.hallId, dockIds: r.dockIds }))).toEqual([
      { hallId, dockIds: [a.id, b.id].sort() },
    ]);
  });
});

describe('ADR-0017 the database holds every membership to its dock profile', () => {
  it('rejects a membership whose profile differs from its dock', async () => {
    const s = await serviceSite(w.A, [{ code: 'T01', hall: 'Halle 1' }]);
    const pool = await holding(s.siteId, s.docks.T01 as string);
    const db = ownerDb();
    await db.delete(resourceDock).where(eq(resourceDock.dockId, s.docks.T01 as never));
    const state = await sqlState(
      db.insert(resourceDock).values({
        dockId: s.docks.T01 as never,
        resourceId: pool?.id as never,
        resourceKind: ResourceKind.pool,
        siteId: s.siteId,
        tenantId: w.A.tenantId,
        doorType: DoorType.dock_leveler,
        temperatureZone: TemperatureZone.frozen,
        adrAllowed: false,
      }),
    );
    expect(state).toBe(SqlState.foreign_key_violation);
  });

  it("rejects a pooled dock's own profile change", async () => {
    const s = await serviceSite(w.A, [{ code: 'T01', hall: 'Halle 1' }]);
    const state = await sqlState(
      ownerDb()
        .update(dock)
        .set({ temperatureZone: TemperatureZone.chilled })
        .where(and(eq(dock.id, s.docks.T01 as never), eq(dock.siteId, s.siteId))),
    );
    expect(state).toBe(SqlState.foreign_key_violation);
  });
});

describe('ADR-0017 every dock stays in a resource with an active load type', () => {
  /** Docks of the site in no resource, or in one without an active load type. */
  const unbookable = async (siteId: SiteId) =>
    (
      await ownerDb().execute<{ code: string }>(sql`
        select d.code from dock d left join resource_dock rd on rd.dock_id = d.id
        where d.site_id = ${siteId} and (rd.dock_id is null or not exists (
          select 1 from load_type_resource ltr join load_type lt on lt.id = ltr.load_type_id
          where ltr.resource_id = rd.resource_id and lt.active))
        order by d.code`)
    ).rows.map((r) => r.code);

  it('holds after every master data write, allowed or refused', async () => {
    const s = await serviceSite(w.A, [
      ...['T01', 'T02', 'T03', 'T04', 'T05'].map((code) => ({ code, hall: 'Halle 1' })),
      ...['T06', 'T07', 'T08'].map((code) => ({ code, hall: 'Halle 2' })),
      { code: 'T09', hall: 'Halle 2', temperatureZone: TemperatureZone.frozen },
    ]);
    const d = (code: string) => s.docks[code] as DockId;
    const poolOf = async (code: string) => (await holding(s.siteId, d(code)))?.id as ResourceId;
    const types = () =>
      asTenantRequest(w.A, (tx, req) => listLoadTypes(tx, req.tenantId, s.siteId));
    const clock = testClock(new Date('2026-10-19T08:00:00Z'));
    let express = '' as ResourceId;
    const halle2 = await poolOf('T06');

    const steps: [string, (tx: Tx, req: TenantRequest) => Promise<unknown>][] = [
      [
        'createDock',
        (tx, req) =>
          createDock(
            tx,
            req,
            clock,
            s.siteId,
            CreateDock.parse({
              hallId: s.halls['Halle 2'],
              code: 'T10',
              doorType: DoorType.dock_leveler,
              temperatureZone: TemperatureZone.chilled,
            }),
          ),
      ],
      [
        'createResource',
        async (tx, req) => {
          express = (
            await createResource(tx, req, {
              siteId: s.siteId,
              kind: ResourceKind.pool,
              name: 'Express',
              directions: [Direction.inbound],
              dockIds: [d('T05'), d('T08')],
            })
          ).id as ResourceId;
        },
      ],
      ['putResourceDocks', (tx, req) => putResourceDocks(tx, req, express, [d('T05')])],
      ['bookDock single', (tx, req) => bookDock(tx, req, d('T07'), { as: ResourceKind.single })],
      [
        'bookDock pool',
        (tx, req) => bookDock(tx, req, d('T07'), { as: ResourceKind.pool, resourceId: halle2 }),
      ],
      [
        'updateDock profile',
        (tx, req) =>
          updateDock(tx, req, s.siteId, d('T04'), { temperatureZone: TemperatureZone.chilled }),
      ],
      [
        'updateDock hall',
        (tx, req) => updateDock(tx, req, s.siteId, d('T03'), { hallId: s.halls['Halle 2'] }),
      ],
      [
        'putLoadTypeResources',
        async (tx, req) => {
          for (const lt of await listLoadTypes(tx, req.tenantId, s.siteId)) {
            await putLoadTypeResources(tx, req.tenantId, lt.id as LoadTypeId, []);
          }
        },
      ],
      [
        'updateLoadType',
        async (tx, req) => {
          for (const lt of await listLoadTypes(tx, req.tenantId, s.siteId)) {
            await updateLoadType(tx, req, lt.id as LoadTypeId, { active: false });
          }
        },
      ],
    ];
    const outcomes: Record<string, string> = {};
    for (const [name, write] of steps) {
      outcomes[name] = await asTenantRequest(w.A, write).then(
        () => 'ok',
        (e: unknown) => {
          if (e instanceof ApiError) return String(e.details?.reason ?? e.code);
          throw e;
        },
      );
      expect({ name, unbookable: await unbookable(s.siteId) }).toEqual({ name, unbookable: [] });
    }
    expect(outcomes).toMatchObject({
      createDock: 'ok',
      createResource: 'ok',
      putResourceDocks: 'ok',
      'bookDock single': 'ok',
      'bookDock pool': 'ok',
      'updateDock profile': 'ok',
      'updateDock hall': 'ok',
      putLoadTypeResources: 'dock_without_load_type',
      updateLoadType: 'dock_without_load_type',
    });
    expect((await types()).every((lt) => lt.active)).toBe(true);
  });

  it('refuses to move a pooled dock to another profile while booking.pools is off', async () => {
    const s = await serviceSite(w.A, [{ code: 'T01', hall: 'Halle 1' }]);
    const before = await holding(s.siteId, s.docks.T01 as string);
    const refused = await asTenantRequest(
      w.A,
      (tx, req) =>
        updateDock(tx, req, s.siteId, s.docks.T01 as DockId, {
          temperatureZone: TemperatureZone.frozen,
        }),
      { pools: false },
    ).catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: ErrorCode.entitlement_required });
    expect((await holding(s.siteId, s.docks.T01 as string))?.id).toBe(before?.id);
  });
});
