import type { OnboardingView } from '@rampflow/shared/modules/core/api.onboarding';
import {
  DockStatus,
  OnboardingCase,
  OnboardingStep,
  TenantStatus,
} from '@rampflow/shared/modules/core/values';
import { ErrorCode, Limit, StaffLocale, TenantRole } from '@rampflow/shared/values';
import { and, count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { loadRouteCases } from '../../../../test/route-cases.ts';
import { onboardingTenant, WORLD_NOW, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { type OrgId, type TenantId, wrapJson } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { publicLinkCount } from '../../booking/carriers/fixtures.ts';
import { carrierInvitation } from '../../booking/schema.carriers.ts';
import { booking } from '../../booking/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { dock, entitlementOverride, org } from '../schema.ts';
import { onboardingSteps } from './fixtures.ts';

const DAY = 24 * 3600_000;
const appAt = (now: Date) => createApp({ clock: testClock(now) });
const app = appAt(WORLD_NOW);

const activatedAt = async (tenantId: TenantId) => {
  const [row] = await ownerDb()
    .select({ at: org.activatedAt })
    .from(org)
    .where(eq(org.id, tenantId as string as OrgId));
  return row?.at ?? null;
};

const view = async (admin: Parameters<typeof as>[1], tenantId: TenantId) => {
  const res = await as(app, admin).get(`/api/t/${tenantId}/onboarding`);
  expect(res.status).toBe(200);
  return (await res.json()) as OnboardingView;
};

describe('ON-02 the first dock activates the tenant', () => {
  it('sets activatedAt to the clock time of the first dock, and a second dock a day later keeps it', async () => {
    const t = await onboardingTenant();
    const steps = onboardingSteps(app, t.users.tenant_admin, t.tenantId);
    const siteId = await steps.site();
    const hallId = await steps.hall(siteId);
    expect(await activatedAt(t.tenantId)).toBeNull();

    expect((await steps.dock(siteId, hallId)).status).toBe(201);
    expect(await activatedAt(t.tenantId)).toEqual(WORLD_NOW);

    const nextDay = onboardingSteps(
      appAt(new Date(WORLD_NOW.getTime() + DAY)),
      t.users.tenant_admin,
      t.tenantId,
    );
    expect((await nextDay.dock(siteId, hallId, 'T02')).status).toBe(201);
    expect(await activatedAt(t.tenantId)).toEqual(WORLD_NOW);
  });

  it('stays active when every dock and every site is set inactive', async () => {
    const t = await onboardingTenant();
    const admin = as(app, t.users.tenant_admin);
    const steps = onboardingSteps(app, t.users.tenant_admin, t.tenantId);
    const siteId = await steps.site();
    const hallId = await steps.hall(siteId);
    const created = await steps.dock(siteId, hallId);
    const dockId = ((await created.json()) as { id: string }).id;
    const sites = `/api/t/${t.tenantId}/sites`;
    const off = await admin.patch(`${sites}/${siteId}/docks/${dockId}`, {
      body: { status: DockStatus.inactive },
    });
    expect(off.status).toBe(200);
    expect((await admin.patch(`${sites}/${siteId}`, { body: { active: false } })).status).toBe(200);
    expect(await activatedAt(t.tenantId)).toEqual(WORLD_NOW);
    const ctx = (await (await admin.get(`/api/t/${t.tenantId}/context`)).json()) as {
      status: TenantStatus;
    };
    expect(ctx.status).toBe(TenantStatus.active);
  });

  it('leaves a tenant with a site and a hall but no dock in onboarding', async () => {
    const t = await onboardingTenant();
    const steps = onboardingSteps(app, t.users.tenant_admin, t.tenantId);
    await steps.hall(await steps.site());
    expect(await activatedAt(t.tenantId)).toBeNull();
    expect((await view(t.users.tenant_admin, t.tenantId)).status).toBe(TenantStatus.onboarding);
  });

  it('leaves the tenant in onboarding when the first dock fails with 409 limit_reached', async () => {
    const t = await onboardingTenant();
    const author = (await onboardingTenant()).users.tenant_admin;
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: t.tenantId,
        key: Limit.core.max_docks,
        value: wrapJson(0),
        updatedBy: author.id,
      });
    const steps = onboardingSteps(app, t.users.tenant_admin, t.tenantId);
    const siteId = await steps.site();
    const res = await steps.dock(siteId, await steps.hall(siteId));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      ErrorCode.limit_reached,
    );
    const [docks] = await ownerDb()
      .select({ n: count() })
      .from(dock)
      .where(eq(dock.tenantId, t.tenantId));
    expect(docks?.n).toBe(0);
    expect(await activatedAt(t.tenantId)).toBeNull();
  });
});

describe('ON-01 onboarding steps', () => {
  const stepsOf = (v: OnboardingView) =>
    v.steps.map((s) => ({ id: s.id, done: s.done, siteId: s.siteId }));

  it('lists site, hall and dock open for a tenant without sites', async () => {
    const t = await onboardingTenant();
    expect(await view(t.users.tenant_admin, t.tenantId)).toEqual({
      status: TenantStatus.onboarding,
      activatedAt: null,
      steps: [
        { id: OnboardingStep.site, done: false, siteId: null },
        { id: OnboardingStep.hall, done: false, siteId: null },
        { id: OnboardingStep.dock, done: false, siteId: null },
      ],
    });
  });

  it('marks the site done with its id while hall and dock are open', async () => {
    const t = await onboardingTenant();
    const siteId = await onboardingSteps(app, t.users.tenant_admin, t.tenantId).site();
    const v = await view(t.users.tenant_admin, t.tenantId);
    expect(v.status).toBe(TenantStatus.onboarding);
    expect(v.activatedAt).toBeNull();
    expect(stepsOf(v)).toEqual([
      { id: OnboardingStep.site, done: true, siteId },
      { id: OnboardingStep.hall, done: false, siteId },
      { id: OnboardingStep.dock, done: false, siteId: null },
    ]);
  });

  it('links the dock step to the site with a hall, and marks every step done after the first dock', async () => {
    const t = await onboardingTenant();
    const steps = onboardingSteps(app, t.users.tenant_admin, t.tenantId);
    const siteId = await steps.site('A Bremerhaven');
    const hallId = await steps.hall(siteId);
    const v = await view(t.users.tenant_admin, t.tenantId);
    expect(stepsOf(v)[2]).toEqual({ id: OnboardingStep.dock, done: false, siteId });
    expect((await steps.dock(siteId, hallId)).status).toBe(201);
    const active = await view(t.users.tenant_admin, t.tenantId);
    expect(active.status).toBe(TenantStatus.active);
    expect(active.activatedAt).toBe(WORLD_NOW.toISOString());
    expect(active.steps.every((s) => s.done)).toBe(true);
  });

  it('answers 403 forbidden to a dispatcher', async () => {
    const t = await onboardingTenant();
    const res = await as(app, t.users.dispatcher).get(`/api/t/${t.tenantId}/onboarding`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      ErrorCode.forbidden,
    );
  });
});

describe('ON-03 carrier-facing and booking actions wait for the first dock', () => {
  const gated = (async () =>
    (await loadRouteCases())
      .map((l) => l.case)
      .filter((rc) => rc.onboarding === OnboardingCase.blocked))();

  /** Rows a gated route could write for the tenant: invitations, links, bookings, emails. */
  const written = async (tenantId: TenantId) => {
    const o = ownerDb();
    const n = async (rows: Promise<{ n: number }[]>) => (await rows)[0]?.n ?? 0;
    return {
      invitations: await n(
        o
          .select({ n: count() })
          .from(carrierInvitation)
          .where(eq(carrierInvitation.tenantId, tenantId)),
      ),
      links: await publicLinkCount(o, tenantId),
      bookings: await n(
        o.select({ n: count() }).from(booking).where(eq(booking.tenantId, tenantId)),
      ),
      emails: await n(
        o.select({ n: count() }).from(outboxMessage).where(eq(outboxMessage.tenantId, tenantId)),
      ),
    };
  };

  it('covers the six routes of design decision 4', async () => {
    expect((await gated).map((rc) => `${rc.method} ${rc.path}`).sort()).toEqual([
      'POST /api/c/:orgId/at/:tenantId/bookings',
      'POST /api/t/:orgId/bookings',
      'POST /api/t/:orgId/carriers/invitations',
      'POST /api/t/:orgId/carriers/public-links',
      'POST /api/t/:orgId/carriers/public-links/:siteId/regenerate',
      'POST /api/t/:orgId/yard/walk-ins',
    ]);
  });

  it('answers 409 onboarding_incomplete on each and writes nothing', async () => {
    for (const rc of await gated) {
      const w = await world();
      await rc.setup?.(w, ownerDb());
      await ownerDb()
        .update(org)
        .set({ activatedAt: null })
        .where(eq(org.id, w.A.tenantId as string as OrgId));
      const params = rc.params(w);
      const path = rc.path.replace(/:([A-Za-z]+)/g, (_, k: string) => params[k] as string);
      const query = rc.query ? `?${new URLSearchParams(rc.query(w))}` : '';
      const actor = w.A.users[rc.as as keyof typeof w.A.users];
      const before = await written(w.A.tenantId);
      const res = await as(app, actor).request(rc.method, `${path}${query}`, {
        body: rc.body?.(w),
      });
      expect({ route: rc.path, status: res.status }).toEqual({ route: rc.path, status: 409 });
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        ErrorCode.onboarding_incomplete,
      );
      expect(await written(w.A.tenantId)).toEqual(before);
    }
  });

  it('answers 403 to a gate operator inviting a carrier, before the onboarding check', async () => {
    const t = await onboardingTenant();
    const res = await as(app, t.users.gate_operator).post(
      `/api/t/${t.tenantId}/carriers/invitations`,
      { body: { companyName: 'Baltic Freight UAB', email: 'dispo@baltic.test' } },
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      ErrorCode.forbidden,
    );
  });

  it('sends the carrier invitation after the first dock, and a staff invitation during onboarding', async () => {
    const t = await onboardingTenant();
    const admin = as(app, t.users.tenant_admin);
    const emailsTo = async (to: string) =>
      (
        await ownerDb()
          .select({ n: count() })
          .from(outboxMessage)
          .where(and(eq(outboxMessage.tenantId, t.tenantId), eq(outboxMessage.toEmail, to)))
      )[0]?.n;

    const staff = await admin.post(`/api/t/${t.tenantId}/staff/invitations`, {
      body: { email: 'lager@nordhafen.local', role: TenantRole.dispatcher },
    });
    expect(staff.status).toBe(201);
    expect(await emailsTo('lager@nordhafen.local')).toBe(1);

    const carrier = {
      companyName: 'Baltic Freight UAB',
      email: 'dispo@baltic.test',
      locale: StaffLocale.en,
    };
    const blocked = await admin.post(`/api/t/${t.tenantId}/carriers/invitations`, {
      body: carrier,
    });
    expect(blocked.status).toBe(409);
    expect(await emailsTo(carrier.email)).toBe(0);

    const steps = onboardingSteps(app, t.users.tenant_admin, t.tenantId);
    const siteId = await steps.site();
    expect((await steps.dock(siteId, await steps.hall(siteId))).status).toBe(201);
    const sent = await admin.post(`/api/t/${t.tenantId}/carriers/invitations`, { body: carrier });
    expect(sent.status).toBe(201);
    expect(await emailsTo(carrier.email)).toBe(1);
  });
});
