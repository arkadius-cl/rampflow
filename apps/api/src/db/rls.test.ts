import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { VersionStatus } from '@rampflow/shared/modules/safety/values';
import {
  CarrierRole,
  OrgKind,
  PolicyReader,
  ScopeParty,
  SiteAccess,
  SystemActorName,
  TenantActorKind,
  TenantRole,
} from '@rampflow/shared/values';
import { getTableColumns, getTableName, sql } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDb, unscoped } from '../../test/db.ts';
import { seedModel } from '../../test/model.ts';
import { type World, world } from '../../test/world.ts';
import * as avisSchema from '../modules/avis/schema.ts';
import * as carriersSchema from '../modules/booking/schema.carriers.ts';
import * as resourcesSchema from '../modules/booking/schema.resources.ts';
import * as bookingSchema from '../modules/booking/schema.ts';
import * as brandSchema from '../modules/brand/schema.ts';
import * as signupSchema from '../modules/core/schema.signup.ts';
import * as coreSchema from '../modules/core/schema.ts';
import * as driverSchema from '../modules/driver/schema.ts';
import * as notifySchema from '../modules/notify/schema.ts';
import * as privacySchema from '../modules/privacy/schema.ts';
import * as safetySchema from '../modules/safety/schema.ts';
import { hashToken } from './ids.ts';
import { type Scope, withScope } from './scope.ts';

// The party matrix (ADR-0002, data model "Policy classes"). For every party, every table with
// RLS is read as rampflow_app under that party's scope, and the rows it returns must equal the
// rows an oracle written from docs/reference/data-model.md expects, over every row in the table.

type Row = Record<string, unknown>;
type Party = Scope['party'] | null;

interface Ctx {
  party: Party;
  tenant?: string;
  sites?: readonly string[] | 'all';
  carrier?: string;
  user?: string | null;
  booking?: string;
  token?: string;
}

interface Relations {
  links: { tenant_id: string; carrier_id: string }[];
  memberships: { user_id: string; org_id: string; org_kind: string }[];
  registrations: { tenant_id: string; carrier_id: string | null }[];
  versionStatus: Map<string, string>;
}

type Rule = (c: Ctx, r: Row, rel: Relations) => boolean;

const is = (c: Ctx, ...parties: Party[]) => parties.includes(c.party);
const siteOk = (c: Ctx, site: unknown) =>
  c.sites === SiteAccess.all || (c.sites ?? []).includes(String(site));
const linked = (c: Ctx, rel: Relations, tenant: unknown) =>
  rel.links.some((l) => l.tenant_id === tenant && l.carrier_id === c.carrier);
const sameTenant = (c: Ctx, r: Row) => r.tenant_id === c.tenant;

type Reader = PolicyReader;
const tenantRef =
  (readers: readonly Reader[], siteColumn?: string): Rule =>
  (c, r, rel) =>
    (is(c, ScopeParty.tenant) && sameTenant(c, r) && (!siteColumn || siteOk(c, r[siteColumn]))) ||
    (readers.includes(PolicyReader.carrier) &&
      is(c, ScopeParty.carrier) &&
      linked(c, rel, r.tenant_id)) ||
    readers.some((p) => p !== PolicyReader.carrier && is(c, p) && sameTenant(c, r));

const tenantPrivate: Rule = (c, r) => is(c, ScopeParty.tenant) && sameTenant(c, r);

const bookingFamily =
  (bookingColumn: string, driverReads = true): Rule =>
  (c, r) =>
    (is(c, ScopeParty.tenant) && sameTenant(c, r) && siteOk(c, r.site_id)) ||
    (is(c, ScopeParty.carrier) && r.carrier_id === c.carrier) ||
    (is(c, ScopeParty.carrier_at_tenant) && sameTenant(c, r) && r.carrier_id === c.carrier) ||
    (driverReads && is(c, ScopeParty.driver) && r[bookingColumn] === c.booking);

const driverOwn: Rule = (c, r) =>
  is(c, ScopeParty.driver) && sameTenant(c, r) && r.booking_id === c.booking;

const sharesOrg = (c: Ctx, rel: Relations, user: unknown) =>
  rel.memberships.some(
    (m) =>
      m.user_id === user &&
      ((is(c, ScopeParty.tenant) && m.org_id === c.tenant) ||
        (is(c, ScopeParty.carrier, ScopeParty.carrier_at_tenant) && m.org_id === c.carrier) ||
        (is(c, ScopeParty.tenant) &&
          m.org_kind === OrgKind.carrier &&
          rel.links.some((l) => l.tenant_id === c.tenant && l.carrier_id === m.org_id))),
  );

/** Who may read which row, per table, as the data model states it. */
const ORACLE: Record<string, Rule> = {
  org: (c, r, rel) =>
    is(c, ScopeParty.platform, ScopeParty.system) ||
    (is(c, ScopeParty.user) &&
      rel.memberships.some((m) => m.user_id === c.user && m.org_id === r.id)) ||
    (is(c, ScopeParty.tenant, ScopeParty.driver, ScopeParty.public) && r.id === c.tenant) ||
    (is(c, ScopeParty.tenant) &&
      rel.links.some((l) => l.tenant_id === c.tenant && l.carrier_id === r.id)) ||
    (is(c, ScopeParty.tenant) &&
      rel.registrations.some((g) => g.tenant_id === c.tenant && g.carrier_id === r.id)) ||
    (is(c, ScopeParty.carrier_at_tenant) && (r.id === c.tenant || r.id === c.carrier)) ||
    (is(c, ScopeParty.carrier) &&
      (r.id === c.carrier ||
        linked(c, rel, r.id) ||
        rel.registrations.some((g) => g.carrier_id === c.carrier && g.tenant_id === r.id))),
  app_user: (c, r, rel) =>
    is(c, ScopeParty.platform) ||
    (is(c, ScopeParty.user, ScopeParty.token) && r.id === c.user) ||
    (is(c, ScopeParty.tenant, ScopeParty.carrier, ScopeParty.carrier_at_tenant) &&
      sharesOrg(c, rel, r.id)),
  membership: (c, r) =>
    is(c, ScopeParty.platform) ||
    (is(c, ScopeParty.user) && r.user_id === c.user) ||
    (is(c, ScopeParty.tenant) && r.org_id === c.tenant) ||
    (is(c, ScopeParty.carrier) && r.org_id === c.carrier),
  membership_site: (c, r) =>
    tenantPrivate(c, r, never) || (is(c, ScopeParty.user) && r.user_id === c.user),
  invitation: (c, r) =>
    is(c, ScopeParty.platform) ||
    (is(c, ScopeParty.tenant) && r.org_id === c.tenant) ||
    (is(c, ScopeParty.carrier) && r.org_id === c.carrier) ||
    (is(c, ScopeParty.token) && r.token_hash === c.token),
  tenant_subscription: (c, r, rel) =>
    is(c, ScopeParty.platform) ||
    (is(c, ScopeParty.tenant, ScopeParty.carrier_at_tenant, ScopeParty.driver, ScopeParty.public) &&
      sameTenant(c, r)) ||
    (is(c, ScopeParty.carrier) && linked(c, rel, r.tenant_id)),
  entitlement_override: (c, r) =>
    is(c, ScopeParty.platform) || (is(c, ScopeParty.tenant) && sameTenant(c, r)),
  setting_value: (c, r, rel) =>
    (c.party !== null && r.tenant_id === null) ||
    (is(c, ScopeParty.tenant) &&
      sameTenant(c, r) &&
      (r.site_id === null || siteOk(c, r.site_id))) ||
    (is(c, ScopeParty.carrier_at_tenant, ScopeParty.driver, ScopeParty.public) &&
      sameTenant(c, r)) ||
    (is(c, ScopeParty.carrier) && linked(c, rel, r.tenant_id)),
  site: tenantRef(
    [
      PolicyReader.carrier,
      PolicyReader.carrier_at_tenant,
      PolicyReader.driver,
      PolicyReader.public,
    ],
    'id',
  ),
  hall: tenantRef(
    [PolicyReader.carrier, PolicyReader.carrier_at_tenant, PolicyReader.driver],
    'site_id',
  ),
  dock: tenantRef(
    [PolicyReader.carrier, PolicyReader.carrier_at_tenant, PolicyReader.driver],
    'site_id',
  ),
  tenant_carrier_link: (c, r) =>
    (is(c, ScopeParty.tenant) && sameTenant(c, r)) ||
    (is(c, ScopeParty.carrier) && r.carrier_id === c.carrier) ||
    (is(c, ScopeParty.carrier_at_tenant) && sameTenant(c, r) && r.carrier_id === c.carrier),
  outbox_message: (c) => is(c, ScopeParty.system),
  bookable_resource: tenantRef(
    [PolicyReader.carrier, PolicyReader.carrier_at_tenant, PolicyReader.driver],
    'site_id',
  ),
  load_type: tenantRef(
    [PolicyReader.carrier, PolicyReader.carrier_at_tenant, PolicyReader.driver],
    'site_id',
  ),
  resource_dock: tenantRef([PolicyReader.carrier_at_tenant], 'site_id'),
  opening_hours: tenantRef([PolicyReader.carrier_at_tenant], 'site_id'),
  closure: tenantRef([PolicyReader.carrier_at_tenant], 'site_id'),
  load_type_resource: tenantRef([PolicyReader.carrier_at_tenant], 'site_id'),
  booking: bookingFamily('id'),
  booking_event: bookingFamily('booking_id'),
  avis: bookingFamily('booking_id', false),
  avis_reference: bookingFamily('booking_id', false),
  driver_access: (c, r, rel) =>
    bookingFamily('booking_id')(c, r, rel) || (is(c, ScopeParty.token) && r.token_hash === c.token),
  carrier_invitation: (c, r) =>
    tenantPrivate(c, r, never) || (is(c, ScopeParty.token) && r.token_hash === c.token),
  carrier_registration: (c, r) =>
    tenantPrivate(c, r, never) ||
    (is(c, ScopeParty.carrier) && r.carrier_id === c.carrier) ||
    (is(c, ScopeParty.token) && r.token_hash === c.token),
  safety_instruction: tenantRef([PolicyReader.driver]),
  safety_instruction_site: tenantRef([PolicyReader.driver]),
  safety_version: (c, r) =>
    tenantPrivate(c, r, never) ||
    (is(c, ScopeParty.driver) && sameTenant(c, r) && r.status !== VersionStatus.draft),
  safety_content: (c, r, rel) =>
    tenantPrivate(c, r, rel) ||
    (is(c, ScopeParty.driver) &&
      sameTenant(c, r) &&
      rel.versionStatus.get(String(r.version_id)) === VersionStatus.published),
  safety_acknowledgement: (c, r) => tenantPrivate(c, r, never) || driverOwn(c, r, never),
  booking_acknowledgement: (c, r) =>
    (is(c, ScopeParty.tenant) && sameTenant(c, r) && siteOk(c, r.site_id)) ||
    driverOwn(c, r, never),
  safety_attempt: (c, r) => tenantPrivate(c, r, never) || driverOwn(c, r, never),
  safety_pass: tenantPrivate,
  tenant_logo: tenantRef([
    PolicyReader.carrier,
    PolicyReader.carrier_at_tenant,
    PolicyReader.driver,
    PolicyReader.public,
  ]),
  privacy_request_log: tenantPrivate,
};
const never: Relations = {
  links: [],
  memberships: [],
  registrations: [],
  versionStatus: new Map(),
};

/** Tables that hold no tenant data and no RLS (ADR-0002, "Tables without RLS"). */
const WITHOUT_RLS = [
  'auth_token',
  'job_run',
  'public_link',
  'rate_limit_event',
  'session',
  'tenant_signup',
];

const TABLES: PgTable[] = [
  coreSchema,
  signupSchema,
  notifySchema,
  resourcesSchema,
  bookingSchema,
  carriersSchema,
  avisSchema,
  driverSchema,
  safetySchema,
  brandSchema,
  privacySchema,
].flatMap((mod) =>
  Object.values(mod).filter(
    (v): v is PgTable =>
      typeof v === 'object' && v !== null && Symbol.for('drizzle:IsDrizzleTable') in v,
  ),
);

function primaryKeyOf(table: PgTable): string[] {
  const config = getTableConfig(table);
  const composite = config.primaryKeys[0]?.columns.map((c) => c.name);
  return (
    composite ??
    Object.values(getTableColumns(table))
      .filter((c) => c.primary)
      .map((c) => c.name)
  );
}

const keyOf = (pk: readonly string[], r: Row) => JSON.stringify(pk.map((k) => r[k]));

async function rowsOf(run: typeof unscoped, table: string): Promise<Row[]> {
  return run(async (tx) => {
    const { rows } = await tx.execute<{ r: Row }>(
      sql`select to_jsonb(t) as r from ${sql.identifier(table)} t`,
    );
    return rows.map((x) => x.r);
  });
}

async function ownerRows(table: string): Promise<Row[]> {
  const { rows } = await ownerDb().execute<{ r: Row }>(
    sql`select to_jsonb(t) as r from ${sql.identifier(table)} t`,
  );
  return rows.map((x) => x.r);
}

let w: World;
let invitationToken: string;
let rel: Relations;
let removePlatformRows: () => Promise<void>;

beforeAll(async () => {
  w = await world();
  ({ invitationA: invitationToken, removePlatformRows } = await seedModel(ownerDb(), w));
  const memberships = (await ownerRows('membership')) as Relations['memberships'];
  const links = (await ownerRows('tenant_carrier_link')) as Relations['links'];
  const registrations = (await ownerRows('carrier_registration')) as Relations['registrations'];
  const versions = await ownerRows('safety_version');
  rel = {
    links,
    memberships,
    registrations,
    versionStatus: new Map(versions.map((v) => [String(v.id), String(v.status)])),
  };
});

afterAll(() => removePlatformRows());

describe('row-level security catalog', () => {
  it('enables RLS on every table except the documented auth and routing tables', async () => {
    const { rows } = await ownerDb().execute<{ tablename: string; rowsecurity: boolean }>(
      sql`select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual(WITHOUT_RLS);
    expect(
      rows
        .filter((r) => r.rowsecurity)
        .map((r) => r.tablename)
        .sort(),
    ).toEqual(Object.keys(ORACLE).sort());
  });

  it('rampflow_app owns no table, cannot bypass RLS and is no superuser', async () => {
    const { rows } = await unscoped((tx) =>
      tx.execute<{ rolsuper: boolean; rolbypassrls: boolean; owned: number }>(sql`
        select r.rolsuper, r.rolbypassrls,
          (select count(*)::int from pg_tables t where t.tableowner = r.rolname) as owned
        from pg_roles r where r.rolname = current_user and current_user = 'rampflow_app'`),
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false, owned: 0 }]);
  });

  it('returns zero rows from every RLS table when no scope is set', async () => {
    const { rows } = await ownerDb().execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' and rowsecurity`,
    );
    const counts: Record<string, number> = {};
    for (const { tablename } of rows) {
      counts[tablename] = (await rowsOf(unscoped, tablename)).length;
      expect(await ownerRows(tablename)).not.toHaveLength(0);
    }
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it('every table maps to its schema file', () => {
    expect(TABLES.map((t) => getTableName(t)).sort()).toEqual(
      [...Object.keys(ORACLE), ...WITHOUT_RLS].sort(),
    );
  });
});

describe('party matrix: each party reads exactly the rows its policies allow', () => {
  const parties: [string, () => { scope: Scope; ctx: Ctx }][] = [
    [
      'anonymous',
      () => ({ scope: { party: ScopeParty.anonymous }, ctx: { party: ScopeParty.anonymous } }),
    ],
    [
      'user',
      () => {
        const userId = w.A.users.dispatcher.id;
        return {
          scope: { party: ScopeParty.user, userId },
          ctx: { party: ScopeParty.user, user: userId },
        };
      },
    ],
    [
      'platform',
      () => {
        const userId = w.platformAdmin.id;
        return {
          scope: { party: ScopeParty.platform, userId },
          ctx: { party: ScopeParty.platform, user: userId },
        };
      },
    ],
    [
      'tenant (all sites)',
      () => ({
        scope: {
          party: ScopeParty.tenant,
          tenantId: w.A.tenantId,
          siteIds: 'all',
          actor: {
            kind: TenantActorKind.user,
            userId: w.A.users.dispatcher.id,
            role: TenantRole.dispatcher,
          },
        },
        ctx: { party: ScopeParty.tenant, tenant: w.A.tenantId, sites: 'all' },
      }),
    ],
    [
      'tenant (gate operator of site 1)',
      () => ({
        scope: {
          party: ScopeParty.tenant,
          tenantId: w.A.tenantId,
          siteIds: [w.A.sites[0].id],
          actor: {
            kind: TenantActorKind.user,
            userId: w.A.users.gate_operator.id,
            role: TenantRole.gate_operator,
          },
        },
        ctx: { party: ScopeParty.tenant, tenant: w.A.tenantId, sites: [w.A.sites[0].id] },
      }),
    ],
    [
      'carrier',
      () => ({
        scope: {
          party: ScopeParty.carrier,
          carrierId: w.A.carrierId,
          userId: w.A.users.carrier_admin.id,
          role: CarrierRole.carrier_admin,
        },
        ctx: { party: ScopeParty.carrier, carrier: w.A.carrierId },
      }),
    ],
    [
      'carrier_at_tenant',
      () => ({
        scope: {
          party: ScopeParty.carrier_at_tenant,
          carrierId: w.A.carrierId,
          tenantId: w.A.tenantId,
          userId: w.A.users.carrier_user.id,
          role: CarrierRole.carrier_user,
        },
        ctx: { party: ScopeParty.carrier_at_tenant, carrier: w.A.carrierId, tenant: w.A.tenantId },
      }),
    ],
    [
      'carrier_at_tenant (rival carrier of the same tenant)',
      () => ({
        scope: {
          party: ScopeParty.carrier_at_tenant,
          carrierId: w.A.rivalCarrierId,
          tenantId: w.A.tenantId,
          userId: w.A.users.rival_user.id,
          role: CarrierRole.carrier_user,
        },
        ctx: {
          party: ScopeParty.carrier_at_tenant,
          carrier: w.A.rivalCarrierId,
          tenant: w.A.tenantId,
        },
      }),
    ],
    [
      'driver',
      () => ({
        scope: {
          party: ScopeParty.driver,
          tenantId: w.A.tenantId,
          bookingId: w.A.bookings.own.id,
          channel: DriverChannel.link,
        },
        ctx: { party: ScopeParty.driver, tenant: w.A.tenantId, booking: w.A.bookings.own.id },
      }),
    ],
    [
      'token',
      () => {
        const tokenHash = hashToken(invitationToken);
        return {
          scope: { party: ScopeParty.token, tokenHash, userId: null },
          ctx: { party: ScopeParty.token, token: `\\x${tokenHash.toString('hex')}`, user: null },
        };
      },
    ],
    [
      'public',
      () => ({
        scope: { party: ScopeParty.public, tenantId: w.A.tenantId, siteId: w.A.sites[0].id },
        ctx: { party: ScopeParty.public, tenant: w.A.tenantId },
      }),
    ],
    [
      'system',
      () => ({
        scope: { party: ScopeParty.system, job: SystemActorName.outbox },
        ctx: { party: ScopeParty.system },
      }),
    ],
  ];

  for (const [name, make] of parties) {
    it(name, async () => {
      const { scope, ctx } = make();
      const mismatches: string[] = [];
      for (const table of TABLES) {
        const tableName = getTableName(table);
        const rule = ORACLE[tableName];
        if (!rule) continue;
        const pk = primaryKeyOf(table);
        const expected = new Set(
          (await ownerRows(tableName)).filter((r) => rule(ctx, r, rel)).map((r) => keyOf(pk, r)),
        );
        const seen = new Set(
          (await rowsOf((fn) => withScope(scope, fn), tableName)).map((r) => keyOf(pk, r)),
        );
        const extra = [...seen].filter((k) => !expected.has(k));
        const missing = [...expected].filter((k) => !seen.has(k));
        if (extra.length)
          mismatches.push(`${tableName}: ${extra.length} row(s) visible beyond policy`);
        if (missing.length)
          mismatches.push(`${tableName}: ${missing.length} allowed row(s) not visible`);
      }
      expect(mismatches).toEqual([]);
    });
  }
});
