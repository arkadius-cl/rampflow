import { type APIRequestContext, type Browser, expect, type Page } from '@playwright/test';
import type { World } from './auth.ts';
import { latestEmailTo, linkIn } from './mailpit.ts';

// Helpers of the U3 specs: platform calls for preconditions, accepting an emailed invitation,
// and logo files.

const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;

const asPlatformAdmin = (w: World) => ({
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
