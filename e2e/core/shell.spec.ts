import { type APIRequestContext, expect, test } from '@playwright/test';
import { catalog, navFor } from '../../packages/shared/src/index.ts';
import { RegistrationMode } from '../../packages/shared/src/modules/booking/values.ts';
import { StaffLocale } from '../../packages/shared/src/values/locales.ts';
import { OrgKind, Role } from '../../packages/shared/src/values/roles.ts';
import {
  expectAccessible,
  seedWorld,
  signInAs,
  type World,
  type WorldUser,
  type WorldUserKey,
} from '../support/auth.ts';
import {
  addMembership,
  createAccount,
  createCarrierInvitation,
  createInvitation,
  uniqueEmail,
} from '../support/db.ts';
import { openPublicLink } from '../support/u7.ts';

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

  // Each role's user of the world, signed in to the area of its org.
  const areas: { role: Role; area: OrgKind }[] = [
    { role: Role.tenant_admin, area: OrgKind.tenant },
    { role: Role.dispatcher, area: OrgKind.tenant },
    { role: Role.gate_operator, area: OrgKind.tenant },
    { role: Role.dock_operator, area: OrgKind.tenant },
    { role: Role.carrier_admin, area: OrgKind.carrier },
    { role: Role.carrier_user, area: OrgKind.carrier },
    { role: Role.platform_admin, area: OrgKind.platform },
  ];
  for (const { role, area } of areas) {
    test(`the sidebar of a ${role} matches navFor`, async ({ page, context, request }) => {
      const w = await seedWorld(request);
      const user: WorldUser =
        role === Role.platform_admin ? w.platformAdmin : w.A.users[role as WorldUserKey];
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
      if (role === Role.dispatcher) await expectAccessible(page);
    });
  }
});

test.describe('Language menu on signed-out pages', () => {
  // A browser that prefers German, so every page starts in German and the choice is visible.
  test.use({ locale: 'de-DE' });

  /** A signed-out page, its English title, and whether it has a field to type into. */
  interface SignedOutPage {
    name: string;
    path: (w: World, request: APIRequestContext) => Promise<string>;
    title: string;
    typed: boolean;
  }

  const pages: SignedOutPage[] = [
    { name: 'sign-in', path: async () => '/login', title: 'Sign in to rampflow', typed: true },
    { name: 'sign-up', path: async () => '/signup', title: 'Register your company', typed: true },
    {
      name: 'sign-up verification',
      path: async () => '/signup/verify',
      title: 'Create your company',
      typed: false,
    },
    {
      name: 'invitation',
      path: async (w) =>
        `/invite#${await createInvitation({
          orgId: w.A.tenantId,
          orgKind: OrgKind.tenant,
          role: Role.dispatcher,
          email: uniqueEmail('language-invite'),
          invitedBy: w.A.users.tenant_admin.id,
        })}`,
      title: 'Accept the invitation',
      typed: true,
    },
    {
      name: 'carrier invitation',
      path: async (w) =>
        `/carrier-invite#${await createCarrierInvitation({
          tenantId: w.A.tenantId,
          companyName: 'Sprachtest Logistik GmbH',
          email: uniqueEmail('language-carrier'),
          invitedBy: w.A.users.tenant_admin.id,
        })}`,
      title: 'Join as a carrier',
      typed: true,
    },
    {
      name: 'carrier registration',
      path: async () => '/carrier-registration',
      title: 'Confirm your registration',
      typed: false,
    },
    { name: 'magic link', path: async () => '/auth/magic', title: 'Sign in by link', typed: false },
    {
      name: 'password reset',
      // The form shows for any token; only saving checks it.
      path: async () => '/auth/reset#not-checked-before-saving',
      title: 'Set a new password',
      typed: true,
    },
    {
      name: 'public booking link',
      path: async (w, request) =>
        `/r/${await openPublicLink(request, w, RegistrationMode.approval_required)}`,
      title: 'Register to book slots',
      typed: true,
    },
  ];

  for (const p of pages) {
    test(`the ${p.name} page switches to English without reload`, async ({ page, request }) => {
      const w = await seedWorld(request);
      const path = await p.path(w, request);
      await page.goto(path);
      const title = page.getByRole('heading', { level: 1 });
      await expect(title).not.toHaveText(p.title);
      const field = page
        .locator('main input:visible:not([type=radio]):not([type=checkbox])')
        .first();
      if (p.typed) await field.fill('typed before switching');
      await page.evaluate('window.notReloaded = true');
      // Token pages drop the fragment once they read it.
      const before = page.url();

      await page.getByRole('button', { name: 'Deutsch' }).click();
      await page.getByRole('menuitemradio', { name: 'English' }).click();
      await page.keyboard.press('Escape');

      await expect(title).toHaveText(p.title);
      expect(page.url()).toBe(before);
      expect(await page.evaluate('window.notReloaded')).toBe(true);
      if (p.typed) await expect(field).toHaveValue('typed before switching');
    });
  }

  test('English chosen on /login survives sign-in for a user without a language', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    const user = await createAccount(
      uniqueEmail('no-language'),
      'no language password',
      'E2E',
      null,
    );
    await addMembership(user.id, w.A.tenantId, OrgKind.tenant, Role.tenant_admin);
    const settings = `/t/${w.A.tenantId}/settings/booking`;

    await page.goto(`/login?redirect=${settings}`);
    await page.getByRole('button', { name: 'Deutsch' }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await page.keyboard.press('Escape');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // The browser prefers German, which would win over the tenant default; the device choice beats both.
    await expect(page).toHaveURL(new RegExp(`${settings}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Booking' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', StaffLocale.en);
  });
});
