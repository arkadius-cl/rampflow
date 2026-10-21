import { expect, test } from '@playwright/test';
import { TenantStatus } from '../../packages/shared/src/modules/core/values.ts';
import { HttpMethod } from '../../packages/shared/src/values/http.ts';
import { expectAccessible, signInByApi } from '../support/auth.ts';
import { createOnboardingTenant } from '../support/db.ts';
import { apiCall, newSiteBody } from '../support/u4.ts';

test.describe('ON-02 Activation by the first dock', () => {
  test('the first dock activates the tenant: the notice goes without a reload', async ({
    page,
    context,
  }) => {
    const t = await createOnboardingTenant();
    await signInByApi(context.request, t.users.tenant_admin);
    const site = await apiCall<{ id: string }>(
      context,
      HttpMethod.POST,
      `/t/${t.tenantId}/sites`,
      newSiteBody('Bremerhaven'),
    );
    await apiCall(context, HttpMethod.POST, `/t/${t.tenantId}/sites/${site.id}/halls`, {
      name: 'Halle 1',
    });
    const context0 = await apiCall<{ status: TenantStatus }>(
      context,
      HttpMethod.GET,
      `/t/${t.tenantId}/context`,
    );
    expect(context0.status).toBe(TenantStatus.onboarding);

    await page.goto(`/t/${t.tenantId}/sites/${site.id}`);
    const notice = page.getByText('Your company is still being set up.', { exact: false });
    await expect(notice).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the setup checklist' })).toHaveAttribute(
      'href',
      `/t/${t.tenantId}/onboarding`,
    );
    await expectAccessible(page);
    await page.evaluate(() => {
      (globalThis as unknown as { loadedOnce: boolean }).loadedOnce = true;
    });

    await page.getByRole('button', { name: 'Dock', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Code').fill('T01');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /T01/ })).toBeVisible();
    await expect(notice).toHaveCount(0);
    expect(
      await page.evaluate(() => (globalThis as unknown as { loadedOnce?: boolean }).loadedOnce),
    ).toBe(true);

    const context1 = await apiCall<{ status: TenantStatus }>(
      context,
      HttpMethod.GET,
      `/t/${t.tenantId}/context`,
    );
    expect(context1.status).toBe(TenantStatus.active);
    await page.goto(`/t/${t.tenantId}/onboarding`);
    await expect(page.getByRole('heading', { name: 'Your company is set up' })).toBeVisible();
    await expect(page.getByText(/^Active since /)).toHaveText(
      /Active since \w+ \d{1,2}, \d{4},\s*\d{2}:\d{2}/,
    );
    await expectAccessible(page);
  });
});
