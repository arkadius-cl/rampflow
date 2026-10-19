import { randomUUID } from 'node:crypto';
import type {
  CarrierInvitationInspect,
  PublicLinkInfo,
} from '@rampflow/shared/modules/booking/api.carriers';
import { logoUrl } from '@rampflow/shared/modules/brand/api';
import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { type TenantId, wrapJson } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { env } from '../../../kernel/env.ts';
import { runJobTick } from '../../../kernel/jobs.ts';
import type { Mail } from '../../../kernel/mailer.ts';
import { deliverOutbox, loadTemplateFile } from '../../../kernel/outbox.ts';
import { carrierInvitationFor, openLinkFor } from '../../booking/carriers/fixtures.ts';
import { entitlementOverride } from '../../core/schema.ts';
import { driverHarness } from '../../driver/session/fixtures.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { logoFor } from './fixtures.ts';

// TN-05: the tenant's logo on the public link page, the carrier invitation page, the driver view
// and every email of the tenant, only while `brand.logo` is on.

const anon = as(createApp({ clock: testClock(new Date()) }), null);

let w: World;
let path: string;
beforeAll(async () => {
  w = await world();
  const { sha } = await logoFor(ownerDb(), w.A.tenantId, w.A.users.tenant_admin.id);
  path = logoUrl(w.A.tenantId, sha);
});

const publicLogo = async (side: World['A']) => {
  const slug = await openLinkFor(ownerDb(), {
    tenantId: side.tenantId,
    siteId: side.sites[0].id,
    by: side.users.tenant_admin.id,
  });
  const res = await anon.get(`/api/public/links/${slug}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as PublicLinkInfo).logoUrl;
};

const invitationLogo = async (side: World['A']) => {
  const { token } = await carrierInvitationFor(ownerDb(), {
    tenantId: side.tenantId,
    invitedBy: side.users.tenant_admin.id,
  });
  const res = await anon.post('/api/public/carrier-invitations/inspect', { body: { token } });
  expect(res.status).toBe(200);
  return ((await res.json()) as CarrierInvitationInspect).logoUrl;
};

const driverLogo = async (side: World['A']) => {
  const { open, request } = driverHarness();
  const { jar } = await open(side.bookings.own.driverToken);
  const res = await request('GET', '/api/driver/booking', { jar });
  expect(res.status).toBe(200);
  return ((await res.json()) as DriverBookingView).tenant.logoUrl;
};

/** Sends one invitation email per tenant through the outbox; the HTML per recipient. */
async function emailHtml(tenants: (TenantId | null)[]): Promise<(string | undefined)[]> {
  const template = await loadTemplateFile('core.invitation');
  // Due long ago, and delivered at that time, so the tick claims these rows and no others.
  const due = new Date('2001-01-01T00:00:00Z');
  const rows = tenants.map((tenantId) => ({
    tenantId,
    template: 'core.invitation',
    toEmail: `logo-${randomUUID()}@mail.test`,
    locale: 'en',
    payload: template.example as Record<string, unknown>,
    nextAttemptAt: due,
  }));
  await ownerDb().insert(outboxMessage).values(rows);
  const sent: Mail[] = [];
  const mailer = { send: async (mail: Mail) => void sent.push(mail) };
  const clock = testClock(new Date('2001-01-02T00:00:00Z'));
  await runJobTick(
    { name: `logo-mail-${randomUUID()}`, everySeconds: null, run: (ctx) => deliverOutbox(ctx) },
    { clock, mailer },
  );
  return rows.map((r) => sent.find((m) => m.to === r.toEmail)?.html);
}

describe('TN-05 the logo where carriers and drivers see the tenant', () => {
  it('the public link, the invitation preview and the driver view carry the logo URL', async () => {
    expect(await publicLogo(w.A)).toBe(path);
    expect(await invitationLogo(w.A)).toBe(path);
    expect(await driverLogo(w.A)).toBe(path);
  });

  it('a tenant without a logo gets null everywhere', async () => {
    expect(await publicLogo(w.B)).toBeNull();
    expect(await invitationLogo(w.B)).toBeNull();
    expect(await driverLogo(w.B)).toBeNull();
  });

  it('an email of the tenant shows the logo with the app origin; others show none', async () => {
    const [a, b, none] = await emailHtml([w.A.tenantId, w.B.tenantId, null]);
    expect(a).toContain(`src="${env.APP_ORIGIN}${path}"`);
    expect(a).toMatch(/<img alt="Tenant A [^"]+"/);
    for (const html of [b, none]) {
      expect(html).toBeDefined();
      expect(html).not.toContain('<img');
    }
  });

  it('nothing shows the logo while brand.logo is off', async () => {
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: w.A.tenantId,
        key: 'brand.logo',
        value: wrapJson(false),
        updatedBy: w.platformAdmin.id,
      });
    expect(await publicLogo(w.A)).toBeNull();
    expect(await invitationLogo(w.A)).toBeNull();
    expect(await driverLogo(w.A)).toBeNull();
    const [html] = await emailHtml([w.A.tenantId]);
    expect(html).toBeDefined();
    expect(html).not.toContain('<img');
  });
});
