import { randomBytes, randomUUID } from 'node:crypto';
import type {
  PlatformMemberList,
  PlatformSiteList,
  TenantDetail,
} from '@rampflow/shared/modules/core/api.platform';
import {
  DockStatus,
  DoorType,
  EuCountry,
  OnboardingStep,
  PlatformMemberKind,
  PlatformMemberSortKey,
  PlatformMemberState,
  PlatformSiteSortKey,
  TaxIdStatus,
  TaxIdType,
  TemperatureZone,
  TenantNoteKind,
  TenantStatus,
} from '@rampflow/shared/modules/core/values';
import {
  ConflictReason,
  ErrorCode,
  OrgKind,
  Role,
  SortOrder,
  YesNo,
} from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import {
  type OnboardingTenant,
  onboardingTenant,
  WORLD_NOW,
  type World,
  world,
} from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { HallId, SiteId, TenantId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { appUser, dock, hall, invitation, org, site, tenantNote } from '../schema.ts';
import { errorOf } from '../staff/fixtures.ts';

// PL-06 tenant hub: the detail read, the master data edit, and the Members and Sites tabs
// through /api/platform against Postgres.

const app = createApp({ clock: testClock(WORLD_NOW) });

let w: World;
beforeAll(async () => {
  w = await world();
});

const platform = () => as(app, w.platformAdmin);
const days = (n: number) => new Date(WORLD_NOW.getTime() + n * 24 * 3600_000);

async function detailOf(tenantId: string): Promise<TenantDetail> {
  const res = await platform().get(`/api/platform/tenants/${tenantId}`);
  expect(res.status).toBe(200);
  return (await res.json()) as TenantDetail;
}

async function addSite(
  tenantId: TenantId,
  input: { name: string; city: string; active?: boolean; createdAt?: Date },
): Promise<SiteId> {
  const [row] = await ownerDb()
    .insert(site)
    .values({
      tenantId,
      name: input.name,
      addressLine1: 'Kai 1',
      postalCode: '20457',
      city: input.city,
      country: EuCountry.DE,
      timeZone: 'Europe/Berlin',
      defaultLocale: 'de',
      active: input.active ?? true,
      createdAt: input.createdAt ?? WORLD_NOW,
    })
    .returning({ id: site.id });
  return row?.id as SiteId;
}

async function addHall(tenantId: TenantId, siteId: SiteId, name: string): Promise<HallId> {
  const [row] = await ownerDb()
    .insert(hall)
    .values({ tenantId, siteId, name })
    .returning({ id: hall.id });
  return row?.id as HallId;
}

async function addDocks(
  tenantId: TenantId,
  siteId: SiteId,
  hallId: HallId,
  statuses: readonly DockStatus[],
) {
  await ownerDb()
    .insert(dock)
    .values(
      statuses.map((status) => ({
        tenantId,
        siteId,
        hallId,
        code: `D-${randomBytes(3).toString('hex')}`,
        doorType: DoorType.dock_leveler,
        temperatureZone: TemperatureZone.ambient,
        status,
      })),
    );
}

describe('PL-06 tenant detail', () => {
  it('carries the onboarding checklist while the tenant is onboarding', async () => {
    const t = await onboardingTenant();
    const siteId = await addSite(t.tenantId, { name: 'Lager Kiel', city: 'Kiel' });
    await addHall(t.tenantId, siteId, 'Halle 1');
    const detail = await detailOf(t.tenantId);
    expect(detail.status).toBe(TenantStatus.onboarding);
    expect(detail.activatedAt).toBeNull();
    expect(detail.onboarding?.steps.map((s) => [s.id, s.done])).toEqual([
      [OnboardingStep.site, true],
      [OnboardingStep.hall, true],
      [OnboardingStep.dock, false],
    ]);
  });

  it('has no checklist once active, and lists the admins with the activation time', async () => {
    const detail = await detailOf(w.A.tenantId);
    expect(detail).toMatchObject({
      status: TenantStatus.active,
      activatedAt: WORLD_NOW.toISOString(),
      onboarding: null,
      suspension: null,
    });
    const [admin] = await ownerDb()
      .select({ id: appUser.id, name: appUser.name, email: appUser.email })
      .from(appUser)
      .where(eq(appUser.id, w.A.users.tenant_admin.id));
    expect(detail.admins).toEqual([admin]);
  });

  it('shows the latest suspension with its reason and author while suspended', async () => {
    const t = await world();
    const tenantId = t.A.tenantId;
    await ownerDb()
      .insert(tenantNote)
      .values([
        {
          tenantId,
          kind: TenantNoteKind.suspended,
          body: 'Fake bookings',
          authorId: t.platformAdmin.id,
          createdAt: days(1),
        },
        {
          tenantId,
          kind: TenantNoteKind.suspended,
          body: 'Unpaid since March',
          authorId: t.platformAdmin.id,
          createdAt: days(3),
        },
        { tenantId, kind: TenantNoteKind.note, body: 'Called the admin', createdAt: days(4) },
      ]);
    await ownerDb()
      .update(org)
      .set({ suspendedAt: days(3) })
      .where(eq(org.id, tenantId as never));
    const [author] = await ownerDb()
      .select({ id: appUser.id, name: appUser.name })
      .from(appUser)
      .where(eq(appUser.id, t.platformAdmin.id));
    const detail = await detailOf(tenantId);
    expect(detail.status).toBe(TenantStatus.suspended);
    expect(detail.suspension).toEqual({
      at: days(3).toISOString(),
      reason: 'Unpaid since March',
      by: author,
    });
    await ownerDb()
      .update(org)
      .set({ suspendedAt: null })
      .where(eq(org.id, tenantId as never));
    expect((await detailOf(tenantId)).suspension).toBeNull();
  });

  it('shows the tax id with the time of its last check', async () => {
    const t = await onboardingTenant();
    await ownerDb()
      .update(org)
      .set({
        taxIdType: TaxIdType.eu_vat,
        taxIdValue: 'DE123456789',
        taxIdStatus: TaxIdStatus.unverified,
        taxIdCheckedAt: days(-1),
      })
      .where(eq(org.id, t.tenantId as never));
    expect((await detailOf(t.tenantId)).taxId).toEqual({
      type: TaxIdType.eu_vat,
      value: 'DE123456789',
      status: TaxIdStatus.unverified,
      checkedAt: days(-1).toISOString(),
    });
  });

  it('answers 404 for a carrier org id', async () => {
    const res = await platform().get(`/api/platform/tenants/${w.A.carrierId}`);
    expect(res.status).toBe(404);
  });
});

describe('PL-06 edit the country', () => {
  const patch = (tenantId: string, body: unknown) =>
    platform().patch(`/api/platform/tenants/${tenantId}`, { body });
  const stored = async (tenantId: string) =>
    (
      await ownerDb()
        .select({
          country: org.country,
          taxIdType: org.taxIdType,
          taxIdValue: org.taxIdValue,
          taxIdStatus: org.taxIdStatus,
        })
        .from(org)
        .where(eq(org.id, tenantId as never))
    )[0];

  it('answers 422 at ["country"] for a value that is not an EU-27 code', async () => {
    const t = await onboardingTenant();
    const res = await patch(t.tenantId, { country: 'Germany' });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['country'] }),
    ]);
    expect((await stored(t.tenantId))?.country).toBeNull();
  });

  it('sets and clears the country of a tenant without a tax id', async () => {
    const t = await onboardingTenant();
    const set = await patch(t.tenantId, { country: EuCountry.CZ });
    expect(set.status).toBe(200);
    expect(((await set.json()) as TenantDetail).country).toBe(EuCountry.CZ);
    const cleared = await patch(t.tenantId, { country: null });
    expect(cleared.status).toBe(200);
    expect(((await cleared.json()) as TenantDetail).country).toBeNull();
    expect((await stored(t.tenantId))?.country).toBeNull();
  });

  describe('with the eu_vat id DE123456789', () => {
    let t: OnboardingTenant;
    beforeAll(async () => {
      t = await onboardingTenant();
      await ownerDb()
        .update(org)
        .set({
          taxIdType: TaxIdType.eu_vat,
          taxIdValue: 'DE123456789',
          taxIdStatus: TaxIdStatus.verified,
        })
        .where(eq(org.id, t.tenantId as never));
    });

    it.each([[EuCountry.AT], [null]])(
      'answers 409 tax_id_country for %s and changes nothing',
      async (country) => {
        const before = await stored(t.tenantId);
        const res = await patch(t.tenantId, { country, name: 'Renamed in vain' });
        expect(res.status).toBe(409);
        expect(await errorOf(res)).toMatchObject({
          code: ErrorCode.conflict,
          details: { reason: ConflictReason.tax_id_country },
        });
        expect(await stored(t.tenantId)).toEqual(before);
        expect((await detailOf(t.tenantId)).name).not.toBe('Renamed in vain');
      },
    );

    it('saves DE and keeps the tax id and its status', async () => {
      const res = await patch(t.tenantId, { country: EuCountry.DE });
      expect(res.status).toBe(200);
      expect(await stored(t.tenantId)).toEqual({
        country: EuCountry.DE,
        taxIdType: TaxIdType.eu_vat,
        taxIdValue: 'DE123456789',
        taxIdStatus: TaxIdStatus.verified,
      });
    });
  });
});

describe('PL-06 sites tab', () => {
  let t: OnboardingTenant;
  let hamburg: SiteId;
  let bremen: SiteId;
  const sitesPath = () => `/api/platform/tenants/${t.tenantId}/sites`;
  const sites = async (query: Record<string, string> = {}) => {
    const res = await platform().get(`${sitesPath()}?${new URLSearchParams(query)}`);
    expect(res.status).toBe(200);
    return (await res.json()) as PlatformSiteList;
  };

  beforeAll(async () => {
    t = await onboardingTenant();
    hamburg = await addSite(t.tenantId, { name: 'Lager Hamburg', city: 'Hamburg' });
    const h1 = await addHall(t.tenantId, hamburg, 'Halle 1');
    const h2 = await addHall(t.tenantId, hamburg, 'Halle 2');
    await addDocks(t.tenantId, hamburg, h1, Array(5).fill(DockStatus.active));
    await addDocks(t.tenantId, hamburg, h2, [
      ...Array(3).fill(DockStatus.active),
      DockStatus.maintenance,
      DockStatus.inactive,
    ]);
    bremen = await addSite(t.tenantId, {
      name: 'Altlager',
      city: 'Bremen',
      active: false,
      createdAt: new Date(WORLD_NOW.getTime() - 60_000),
    });
  });

  it('counts halls and active and maintenance docks per site, and nothing operational', async () => {
    const page = await sites();
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 25 });
    expect(page.facets.active).toEqual({ [YesNo.yes]: 1, [YesNo.no]: 1 });
    expect(page.items).toEqual([
      {
        id: bremen,
        name: 'Altlager',
        city: 'Bremen',
        country: EuCountry.DE,
        timeZone: 'Europe/Berlin',
        active: false,
        halls: 0,
        docks: 0,
        createdAt: new Date(WORLD_NOW.getTime() - 60_000).toISOString(),
      },
      {
        id: hamburg,
        name: 'Lager Hamburg',
        city: 'Hamburg',
        country: EuCountry.DE,
        timeZone: 'Europe/Berlin',
        active: true,
        halls: 2,
        docks: 9,
        createdAt: WORLD_NOW.toISOString(),
      },
    ]);
  });

  it('searches the city, filters by active and sorts by creation', async () => {
    expect((await sites({ q: 'brem' })).items.map((s) => s.id)).toEqual([bremen]);
    const inactive = await sites({ active: YesNo.no });
    expect(inactive.items.map((s) => s.id)).toEqual([bremen]);
    expect(inactive.total).toBe(1);
    expect(inactive.facets.active).toEqual({ [YesNo.yes]: 1, [YesNo.no]: 1 });
    const newest = await sites({ sort: PlatformSiteSortKey.createdAt, order: SortOrder.desc });
    expect(newest.items.map((s) => s.id)).toEqual([hamburg, bremen]);
  });

  it('answers an empty page for a tenant without sites', async () => {
    const empty = await onboardingTenant();
    const res = await platform().get(`/api/platform/tenants/${empty.tenantId}/sites`);
    expect(await res.json()).toMatchObject({ items: [], total: 0 });
  });

  it('answers 404 for a carrier org id', async () => {
    const res = await platform().get(`/api/platform/tenants/${w.A.carrierId}/sites`);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: ErrorCode.not_found });
  });
});

describe('PL-06 members tab', () => {
  let t: OnboardingTenant;
  const id = randomUUID().slice(0, 8);
  const open = `gate-${id}@acme.example`;
  const adminInvite = `boss-${id}@acme.example`;
  const expired = `late-${id}@acme.example`;
  const members = async (query: Record<string, string> = {}) => {
    const res = await platform().get(
      `/api/platform/tenants/${t.tenantId}/members?${new URLSearchParams(query)}`,
    );
    expect(res.status).toBe(200);
    return (await res.json()) as PlatformMemberList;
  };
  const invite = (email: string, role: Role, extra: Partial<typeof invitation.$inferInsert>) =>
    ownerDb()
      .insert(invitation)
      .values({
        orgId: t.tenantId,
        orgKind: OrgKind.tenant,
        email,
        role,
        tokenHash: randomBytes(32),
        expiresAt: days(7),
        createdAt: days(-1),
        ...extra,
      });

  beforeAll(async () => {
    t = await onboardingTenant();
    await invite(open, Role.gate_operator, {});
    await invite(adminInvite, Role.tenant_admin, {});
    await invite(expired, Role.dispatcher, { expiresAt: days(-1 / 24) });
    await invite(`revoked-${id}@acme.example`, Role.dispatcher, { revokedAt: days(-1 / 2) });
    await invite(`accepted-${id}@acme.example`, Role.dispatcher, {
      acceptedAt: days(-1 / 2),
      acceptedUserId: t.users.dispatcher.id,
    });
    await ownerDb()
      .update(appUser)
      .set({ lastSeenAt: days(-2) })
      .where(eq(appUser.id, t.users.tenant_admin.id));
    await ownerDb()
      .update(appUser)
      .set({ disabledAt: days(-3) })
      .where(eq(appUser.id, t.users.gate_operator.id));
  });

  it('lists members and open invitations in one table, without revoked and accepted ones', async () => {
    const page = await members({ sort: PlatformMemberSortKey.email });
    expect(page.total).toBe(6);
    expect(page.items.map((r) => r.email).sort()).toEqual(
      [
        t.users.tenant_admin.email,
        t.users.dispatcher.email,
        t.users.gate_operator.email,
        open,
        adminInvite,
        expired,
      ].sort(),
    );
    const invited = page.items.find((r) => r.email === open);
    expect(invited).toEqual({
      kind: PlatformMemberKind.invitation,
      id: expect.any(String),
      name: null,
      email: open,
      role: Role.gate_operator,
      state: PlatformMemberState.invited,
      emailVerified: false,
      lastActivityAt: null,
      since: days(-1).toISOString(),
      expiresAt: days(7).toISOString(),
    });
    const admin = page.items.find((r) => r.email === t.users.tenant_admin.email);
    expect(admin).toMatchObject({
      kind: PlatformMemberKind.member,
      userId: t.users.tenant_admin.id,
      role: Role.tenant_admin,
      state: PlatformMemberState.member,
      emailVerified: true,
      lastActivityAt: days(-2).toISOString(),
    });
  });

  it('marks expired invitations and disabled users', async () => {
    const page = await members();
    const stateOf = (email: string) => page.items.find((r) => r.email === email)?.state;
    expect(stateOf(expired)).toBe(PlatformMemberState.expired);
    expect(stateOf(t.users.gate_operator.email)).toBe(PlatformMemberState.disabled);
    expect(page.facets.state).toEqual({
      [PlatformMemberState.member]: 2,
      [PlatformMemberState.disabled]: 1,
      [PlatformMemberState.invited]: 2,
      [PlatformMemberState.expired]: 1,
    });
    const onlyExpired = await members({ state: PlatformMemberState.expired });
    expect(onlyExpired.items.map((r) => r.email)).toEqual([expired]);
    expect(onlyExpired.total).toBe(1);
  });

  it('filters by role: admins and admin invitations', async () => {
    const page = await members({ role: Role.tenant_admin });
    expect(page.items.map((r) => [r.kind, r.email])).toEqual([
      [PlatformMemberKind.member, t.users.tenant_admin.email],
      [PlatformMemberKind.invitation, adminInvite],
    ]);
    expect(page.facets.role).toMatchObject({
      [Role.tenant_admin]: 2,
      [Role.dispatcher]: 2,
      [Role.gate_operator]: 2,
    });
  });

  it('searches name and email', async () => {
    expect((await members({ q: `gate-${id}` })).items.map((r) => r.email)).toEqual([open]);
    const byName = await members({ q: t.users.dispatcher.email.split('@')[0] as string });
    expect(byName.items.map((r) => r.email)).toEqual([t.users.dispatcher.email]);
  });

  it('sorts by last activity with never-active rows last in both directions', async () => {
    for (const order of [SortOrder.asc, SortOrder.desc]) {
      const page = await members({ sort: PlatformMemberSortKey.lastActivityAt, order });
      expect(page.items[0]?.email).toBe(t.users.tenant_admin.email);
      expect(page.items.slice(1).every((r) => r.lastActivityAt === null)).toBe(true);
    }
  });

  it('answers 404 for a carrier org id', async () => {
    const res = await platform().get(`/api/platform/tenants/${w.A.carrierId}/members`);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: ErrorCode.not_found });
  });
});
