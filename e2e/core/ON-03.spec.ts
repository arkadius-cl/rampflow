import { expect, test } from '@playwright/test';
import { DoorType, TemperatureZone } from '../../packages/shared/src/modules/core/values.ts';
import { ErrorCode } from '../../packages/shared/src/values/errors.ts';
import { HttpMethod } from '../../packages/shared/src/values/http.ts';
import { TenantRole } from '../../packages/shared/src/values/roles.ts';
import { APP_ORIGIN, expectAccessible, signInByApi } from '../support/auth.ts';
import { createOnboardingTenant, uniqueEmail } from '../support/db.ts';
import { expectNoEmailTo, latestEmailTo } from '../support/mailpit.ts';
import { apiCall, newSiteBody } from '../support/u4.ts';

test.describe('ON-03 Gating during onboarding', () => {
  test('carriers, links, bookings and walk-ins wait for the first dock; staff invitations do not', async ({
    page,
    context,
    request,
  }) => {
    // Three Mailpit waits, one of them for the absence of an email.
    test.setTimeout(90_000);
    const t = await createOnboardingTenant();
    await signInByApi(context.request, t.users.tenant_admin);
    const site = await apiCall<{ id: string }>(
      context,
      HttpMethod.POST,
      `/t/${t.tenantId}/sites`,
      newSiteBody('Bremerhaven'),
    );
    const hall = await apiCall<{ id: string }>(
      context,
      HttpMethod.POST,
      `/t/${t.tenantId}/sites/${site.id}/halls`,
      { name: 'Halle 1' },
    );

    await page.goto(`/t/${t.tenantId}/carriers`);
    await expect(page.getByRole('button', { name: 'Invite carrier' })).toBeDisabled();
    const carriersReason = page.getByText('Carriers can be invited once the first dock exists.');
    await expect(carriersReason).toBeVisible();
    await expect(page.getByRole('link', { name: 'Finish setup' }).first()).toHaveAttribute(
      'href',
      `/t/${t.tenantId}/onboarding`,
    );
    await expectAccessible(page);

    await page.goto(`/t/${t.tenantId}/carriers?tab=links`);
    await expect(page.getByRole('button', { name: 'Create link' })).toBeDisabled();
    await expect(page.getByText('Public links open once the first dock exists.')).toBeVisible();

    await page.goto(`/t/${t.tenantId}/plan`);
    await expect(page.getByRole('button', { name: 'New booking' })).toBeDisabled();
    await expect(
      page.getByText('Bookings and walk-ins open once the first dock exists.'),
    ).toBeVisible();

    await page.goto(`/t/${t.tenantId}/gate?site=${site.id}`);
    await expect(page.getByRole('button', { name: 'Walk-in' })).toBeDisabled();
    await expect(page.getByText('Walk-ins open once the first dock exists.')).toBeVisible();
    await expect(
      page.getByText('Your company is still being set up.', { exact: false }),
    ).toBeVisible();

    // The API refuses the same actions and sends nothing.
    const carrierEmail = uniqueEmail('carrier');
    const invite = () =>
      context.request.post(`/api/t/${t.tenantId}/carriers/invitations`, {
        data: { companyName: 'Nordsee Spedition', email: carrierEmail },
        headers: { Origin: APP_ORIGIN },
      });
    const refused = await invite();
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
      ErrorCode.onboarding_incomplete,
    );

    await signInByApi(request, t.users.gate_operator);
    const forbidden = await request.post(`/api/t/${t.tenantId}/carriers/invitations`, {
      data: { companyName: 'Nordsee Spedition', email: carrierEmail },
      headers: { Origin: APP_ORIGIN },
    });
    expect(forbidden.status()).toBe(403);

    const staffEmail = uniqueEmail('lager');
    await apiCall(context, HttpMethod.POST, `/t/${t.tenantId}/staff/invitations`, {
      email: staffEmail,
      role: TenantRole.dispatcher,
    });
    await latestEmailTo(staffEmail);
    await expectNoEmailTo(carrierEmail);

    // The first dock unlocks the carriers page and the invitation.
    await apiCall(context, HttpMethod.POST, `/t/${t.tenantId}/sites/${site.id}/docks`, {
      hallId: hall.id,
      code: 'T01',
      doorType: DoorType.dock_leveler,
      temperatureZone: TemperatureZone.ambient,
    });
    await page.goto(`/t/${t.tenantId}/carriers`);
    await expect(page.getByRole('button', { name: 'Invite carrier' })).toBeEnabled();
    await expect(carriersReason).toHaveCount(0);
    const sent = await invite();
    expect(sent.status(), await sent.text()).toBe(201);
    await latestEmailTo(carrierEmail);
  });
});
