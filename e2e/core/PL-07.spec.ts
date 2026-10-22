import { expect, test } from '@playwright/test';
import { RegistrationMode } from '../../packages/shared/src/modules/booking/values.ts';
import type { TenantDetail } from '../../packages/shared/src/modules/core/api.platform.ts';
import { seedWorld, signInAs } from '../support/auth.ts';
import { asPlatformAdmin, expectAccessibleInBothThemes } from '../support/u3.ts';
import { emailMatching, openPublicLink } from '../support/u7.ts';

// The driver link of a suspended tenant runs in the Pixel project: e2e/driver/PL-07.spec.ts.

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('PL-07 Suspend and reactivate', () => {
  test('a suspension locks staff, carriers and the public link out until the reactivation', async ({
    page,
    context,
    browser,
    request,
  }) => {
    // Two outbox waits and four browsers.
    test.slow();
    const w = await seedWorld(request);
    const slug = await openPublicLink(request, w, RegistrationMode.auto_approve);
    const tenant = (await (
      await request.get(`/api/platform/tenants/${w.A.tenantId}`, { headers: asPlatformAdmin(w) })
    ).json()) as TenantDetail;
    const reason = 'Unpaid since March';
    const dispatcherContext = await browser.newContext();
    await signInAs(dispatcherContext, w.A.users.dispatcher);
    const dispatcher = await dispatcherContext.newPage();
    await dispatcher.goto(`/t/${w.A.tenantId}/plan`);
    await expect(dispatcher.getByRole('button', { name: 'New booking' })).toBeVisible();
    await signInAs(context, w.platformAdmin);

    // From the hub header: the sheet over the hub, the reason required, then a toast.
    await page.goto(`/platform/tenants/${w.A.tenantId}`);
    // The page header: the title's block and the actions next to it.
    const header = page.locator('h1').locator('xpath=../..');
    await page.getByRole('button', { name: 'Suspend', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: `Suspend ${tenant.name}` });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.locator('h1', { hasText: tenant.name })).toBeVisible();
    await expectAccessibleInBothThemes(page);
    await sheet.getByRole('button', { name: 'Suspend tenant' }).click();
    await expect(sheet.getByLabel('Reason')).toHaveAttribute('aria-invalid', 'true');
    await expect(sheet.locator('[data-slot="field-error"]')).not.toBeEmpty();
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Reason').fill(reason);
    await sheet.getByRole('button', { name: 'Suspend tenant' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText(`${tenant.name} suspended.`)).toBeVisible();

    // The status in the header, the Overview and the list.
    await expect(header).toContainText('Suspended');
    await expect(page.getByRole('button', { name: 'Reactivate', exact: true })).toBeVisible();
    const status = page.locator('[data-slot="card"]').filter({ hasText: /^Status/ });
    await expect(status).toContainText('Suspended');
    await expect(status).toContainText(reason);
    await page.goto(`/platform/tenants?${new URLSearchParams({ q: tenant.name })}`);
    await expect(page.getByTestId(`tenant-${w.A.tenantId}`).getByRole('cell').nth(1)).toHaveText(
      'Suspended',
    );

    // The tenant admin's email names the reason.
    const suspendedMail = await emailMatching(
      w.A.users.tenant_admin.email,
      new RegExp(`^${literal(tenant.name)} is suspended on rampflow$`),
    );
    expect(suspendedMail.text).toContain(`Reason: ${reason}`);

    // The dispatcher's open plan board switches to the suspended page on its next request.
    await dispatcher
      .locator('[data-slot="sidebar-content"]')
      .getByRole('link', { name: 'Carriers' })
      .click();
    await expect(dispatcher.getByText('Organisation suspended')).toBeVisible();

    // A fresh load of the plan board is the suspended page too, without a booking.
    await dispatcher.goto(`/t/${w.A.tenantId}/plan`);
    await expect(dispatcher.getByText('Organisation suspended')).toBeVisible();
    await expect(dispatcher.getByRole('button', { name: 'New booking' })).toHaveCount(0);
    await expectAccessibleInBothThemes(dispatcher);

    // The carrier sees the warehouse as temporarily unavailable.
    const carrierContext = await browser.newContext();
    await signInAs(carrierContext, w.A.users.carrier_admin);
    const carrier = await carrierContext.newPage();
    await carrier.goto(`/c/${w.A.carrierId}/tenants`);
    await expect(
      carrier.getByRole('row', { name: new RegExp(`^${literal(tenant.name)}`) }),
    ).toContainText('Temporarily unavailable');

    // The public link reads as not available.
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(`/r/${slug}`);
    await expect(visitor.getByText('Link not available')).toBeVisible();

    // Reactivate: the same dispatcher session works again, and the admin gets an email.
    await page.goto(`/platform/tenants/${w.A.tenantId}`);
    await page.getByRole('button', { name: 'Reactivate', exact: true }).click();
    const again = page.getByRole('dialog', { name: `Reactivate ${tenant.name}` });
    await again.getByLabel('Reason').fill('Paid in full');
    await again.getByRole('button', { name: 'Reactivate tenant' }).click();
    await expect(again).toBeHidden();
    await expect(page.getByText(`${tenant.name} reactivated.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeVisible();
    await dispatcher.goto(`/t/${w.A.tenantId}/plan`);
    await expect(dispatcher.getByRole('button', { name: 'New booking' })).toBeVisible();
    await carrier.reload();
    await expect(carrier.getByText('Temporarily unavailable')).toHaveCount(0);
    await visitor.reload();
    await expect(visitor.getByText(/Tenant A .* · Site/)).toBeVisible();
    await emailMatching(
      w.A.users.tenant_admin.email,
      new RegExp(`^${literal(tenant.name)} is active again on rampflow$`),
    );
    for (const c of [dispatcherContext, carrierContext, visitorContext]) await c.close();
  });
});
