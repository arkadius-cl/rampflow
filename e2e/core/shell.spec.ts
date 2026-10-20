import { expect, test } from '@playwright/test';
import { catalog, navFor } from '../../packages/shared/src/index.ts';
import { OrgKind } from '../../packages/shared/src/values/roles.ts';
import {
  expectAccessible,
  seedWorld,
  signInAs,
  type WorldUser,
  type WorldUserKey,
} from '../support/auth.ts';
import { addMembership } from '../support/db.ts';

const OFFICE_PROBE = 'e2e-shell-probe';

test.describe('Org picker and area shell', () => {
  test('a user with two memberships picks an org and switches to the other', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const user = w.A.users.dispatcher;
    await addMembership(user.id, w.B.carrierId, OrgKind.carrier, 'carrier_admin');
    await signInAs(context, user);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Choose an organisation' })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('link', { name: /Tenant A/ }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${w.A.tenantId}`));

    // An office path no unit owns, so the sidebar stays whatever screens later units add.
    await page.goto(`/t/${w.A.tenantId}/${OFFICE_PROBE}`);
    await page.getByTestId('org-switcher').click();
    await page.getByRole('menuitem', { name: /Carrier B/ }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${w.B.carrierId}`));

    await page.goto('/');
    await expect(page.getByText('Last used')).toBeVisible();
  });

  test('a foreign org id renders no access', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.B.tenantId}`);
    await expect(page.getByText('No access')).toBeVisible();
  });

  const areas: { key: string; area: OrgKind }[] = [
    { key: 'tenant_admin', area: OrgKind.tenant },
    { key: 'dispatcher', area: OrgKind.tenant },
    { key: 'gate_operator', area: OrgKind.tenant },
    { key: 'dock_operator', area: OrgKind.tenant },
    { key: 'carrier_admin', area: OrgKind.carrier },
    { key: 'carrier_user', area: OrgKind.carrier },
    { key: 'platform_admin', area: OrgKind.platform },
  ];
  for (const { key, area } of areas) {
    test(`the sidebar of a ${key} matches navFor`, async ({ page, context, request }) => {
      const w = await seedWorld(request);
      const user: WorldUser =
        key === 'platform_admin' ? w.platformAdmin : w.A.users[key as WorldUserKey];
      await signInAs(context, user);
      const orgId =
        area === OrgKind.tenant ? w.A.tenantId : area === OrgKind.carrier ? w.A.carrierId : null;
      const base = area === OrgKind.platform ? '/platform' : `/${area[0]}/${orgId}`;
      const ctxRes = await context.request.get(`/api${base}/context`);
      const ctx = (await ctxRes.json()) as { permissions: string[]; entitlements?: unknown };
      const permissions = new Set(ctx.permissions) as never;
      const expected = (
        area === OrgKind.tenant
          ? navFor(catalog, { area, permissions, entitlements: ctx.entitlements as never })
          : navFor(catalog, { area, permissions })
      ).map((item) => (orgId ? item.to.replace('$orgId', orgId) : item.to));

      await page.goto(`${base}/${OFFICE_PROBE}`);
      const links = page.locator('[data-slot="sidebar-content"] a');
      await expect(links.first()).toBeVisible();
      const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect([...hrefs].sort()).toEqual([...expected].sort());
      if (key === 'dispatcher') await expectAccessible(page);
    });
  }
});
