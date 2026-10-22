import { randomUUID } from 'node:crypto';
import { type APIRequestContext, type Browser, expect, type Page } from '@playwright/test';
import type { TenantDetail } from '../../packages/shared/src/modules/core/api.platform.ts';
import {
  type DockStatus,
  DoorType,
  type EuCountry,
  type TaxIdStatus,
  type TaxIdType,
  TemperatureZone,
} from '../../packages/shared/src/modules/core/values.ts';
import { PackageId } from '../../packages/shared/src/values/packages.ts';
import { OrgKind, TenantRole } from '../../packages/shared/src/values/roles.ts';
import { Theme } from '../../packages/shared/src/values/ui.ts';
import { expectAccessible, type World } from './auth.ts';
import { activateTenant, addMembership, createAccount, db, uniqueEmail } from './db.ts';
import { latestEmailTo, linkIn } from './mailpit.ts';

// Helpers of the U3 specs: platform calls for preconditions, accepting an emailed invitation,
// and logo files.

const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;

export const asPlatformAdmin = (w: World) => ({
  Cookie: `rf_session=${w.platformAdmin.sessionToken}`,
  Origin: APP_ORIGIN,
});

/** Sets an entitlement override as the platform admin, for preconditions a spec does not drive. */
export async function putOverride(
  request: APIRequestContext,
  w: World,
  tenantId: string,
  key: string,
  value: boolean | number | null,
) {
  const res = await request.put(`/api/platform/tenants/${tenantId}/overrides/${key}`, {
    data: { value, expiresAt: null, note: null },
    headers: asPlatformAdmin(w),
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** One field of a settings topic page, by its setting key. */
export const settingField = (page: Page, key: string) => page.locator(`[data-setting="${key}"]`);

/** Back to the code default for a platform setting. */
export async function resetPlatformSetting(request: APIRequestContext, w: World, key: string) {
  const res = await request.delete(`/api/platform/settings/${key}`, {
    headers: asPlatformAdmin(w),
  });
  expect(res.status(), await res.text()).toBe(204);
}

/**
 * Opens the invitation emailed to `email` in a fresh browser, creates the account and accepts.
 * Returns the page, signed in as the new member.
 */
export async function acceptEmailedInvitation(
  browser: Browser,
  email: string,
  name: string,
): Promise<Page> {
  const mail = await latestEmailTo(email);
  const link = new URL(linkIn(mail.text, '/invite#'));
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link.pathname + link.hash);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('New password').fill('member password 2026');
  await page.getByLabel('Repeat the password').fill('member password 2026');
  await page.getByRole('button', { name: 'Create account and accept' }).click();
  return page;
}

/** A 1x1 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
);

/** Creates a tenant through PL-01 as the platform admin; its admin is an open invitation. */
export async function createTenant(
  request: APIRequestContext,
  w: World,
  name: string,
  o: { package?: PackageId; adminEmail?: string } = {},
): Promise<TenantDetail> {
  const res = await request.post('/api/platform/tenants', {
    headers: asPlatformAdmin(w),
    data: {
      name,
      package: o.package ?? PackageId.pro,
      adminEmail: o.adminEmail ?? uniqueEmail('admin'),
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as TenantDetail;
}

/** Suspends (PL-07) through the API, for preconditions a spec does not drive through the UI. */
export async function suspendTenant(
  request: APIRequestContext,
  w: World,
  tenantId: string,
  reason: string,
) {
  const res = await request.post(`/api/platform/tenants/${tenantId}/suspend`, {
    headers: asPlatformAdmin(w),
    data: { reason },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** The facts a registration (RG-05) or the VIES job write on a tenant, set as the owner. */
export interface TenantFacts {
  country?: EuCountry | null;
  taxId?: { type: TaxIdType; value: string; status: TaxIdStatus; checkedAt?: Date };
  possibleDuplicate?: boolean;
  activated?: boolean;
  /** Adds a dispatcher member last seen at this time, so the tenant has a last activity. */
  lastSeenAt?: Date;
}

export async function setTenantFacts(tenantId: string, facts: TenantFacts): Promise<void> {
  if (facts.country !== undefined) {
    await db().query('update org set country = $1 where id = $2', [facts.country, tenantId]);
  }
  if (facts.taxId) {
    const { type, value, status, checkedAt } = facts.taxId;
    await db().query(
      `update org set tax_id_type = $1, tax_id_value = $2, tax_id_status = $3, tax_id_checked_at = $4
       where id = $5`,
      [type, value, status, checkedAt ?? null, tenantId],
    );
  }
  if (facts.possibleDuplicate !== undefined) {
    await db().query('update org set possible_duplicate = $1 where id = $2', [
      facts.possibleDuplicate,
      tenantId,
    ]);
  }
  if (facts.activated) await activateTenant(tenantId);
  if (facts.lastSeenAt) {
    const member = await createAccount(
      uniqueEmail('seen'),
      'seen member password 1',
      'Seen Member',
    );
    await addMembership(member.id, tenantId, OrgKind.tenant, TenantRole.dispatcher);
    await db().query('update app_user set last_seen_at = $1 where id = $2', [
      facts.lastSeenAt,
      member.id,
    ]);
  }
}

/** A dock on the first hall of a site, written as the owner (no tenant screen in these specs). */
export async function addDock(siteId: string, status: DockStatus): Promise<void> {
  await db().query(
    `insert into dock (tenant_id, site_id, hall_id, code, door_type, temperature_zone, status)
     select h.tenant_id, h.site_id, h.id, $2, $3, $4, $5 from hall h where h.site_id = $1
     order by h.created_at limit 1`,
    [
      siteId,
      `X-${randomUUID().slice(0, 6)}`,
      DoorType.dock_leveler,
      TemperatureZone.ambient,
      status,
    ],
  );
}

/** `n` random digits, for tax ids no other spec uses. */
export const uniqueDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/**
 * `expectAccessible` in light and in dark: the account theme defaults to "system", so the
 * emulated colour scheme switches the page. Ends in light.
 */
export async function expectAccessibleInBothThemes(page: Page) {
  const html = page.locator('html');
  await page.emulateMedia({ colorScheme: Theme.dark });
  await expect(html).toHaveClass(new RegExp(`\\b${Theme.dark}\\b`));
  await expectAccessible(page);
  await page.emulateMedia({ colorScheme: Theme.light });
  await expect(html).not.toHaveClass(new RegExp(`\\b${Theme.dark}\\b`));
  await expectAccessible(page);
}
