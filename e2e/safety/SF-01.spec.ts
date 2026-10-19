import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { acknowledge, bookingsOf, overrideEntitlement } from '../support/u5.ts';

test.describe('SF-01 Author a briefing', () => {
  test('a tenant admin creates a briefing from the template, reviews Polish, publishes, and a material change outdates earlier acknowledgements', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);

    await page.goto(`/t/${w.A.tenantId}/safety/briefings`);
    await expect(page.getByRole('heading', { name: 'Safety briefings' })).toBeVisible();
    await expect(page.getByText('No briefings yet')).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'New briefing' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Hamburg yard rules');
    await dialog.getByRole('radio', { name: 'Chosen sites' }).click();
    await dialog.getByRole('checkbox', { name: 'Site 1' }).click();
    await dialog.getByRole('button', { name: 'Create and edit' }).click();

    await expect(page.getByRole('heading', { name: 'Hamburg yard rules' })).toBeVisible();
    await expect(page.getByText('Site 1', { exact: true })).toBeVisible();
    const languages = page.getByRole('navigation', { name: 'Languages' });
    await expect(languages.getByRole('link')).toHaveCount(12);
    await expect(languages.getByRole('link', { name: /German.*Source/ })).toBeVisible();
    await expect(languages.getByRole('link', { name: /English.*Source/ })).toBeVisible();
    await expect(
      languages.getByRole('link', { name: /Polish.*Machine translation/ }),
    ).toBeVisible();
    await expect(
      languages.getByRole('link', { name: /Turkish.*Machine translation/ }),
    ).toBeVisible();
    await expectAccessible(page);

    await languages.getByRole('link', { name: /Polish/ }).click();
    await page.getByLabel('Title').fill('Zasady bezpieczeństwa na placu');
    await page.getByLabel('Translation status').selectOption({ label: 'Reviewed' });
    await page.getByRole('button', { name: 'Save Polish' }).click();
    await expect(page.getByText('Polish saved.')).toBeVisible();
    await expect(languages.getByRole('link', { name: /Polish.*Reviewed/ })).toBeVisible();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByText('Version 1 is published.')).toBeVisible();
    await expect(page.getByText('Published versions cannot be changed')).toBeVisible();
    await expect(page.getByLabel('Title')).toBeDisabled();

    const instructionId = new URL(page.url()).pathname.split('/').at(-1) as string;
    await acknowledge({
      side: w.A,
      instructionId,
      booking: bookingsOf(w.A).own,
      driverName: 'Jan Kowalski',
      completedAt: new Date(Date.now() - 86_400_000),
      validDays: 365,
    });

    await page.getByRole('button', { name: 'Edit as new version' }).click();
    const versions = page.getByRole('navigation', { name: 'Versions' });
    await expect(versions.getByRole('link', { name: /Version 2.*Draft/ })).toBeVisible();
    await expect(page.getByLabel('Title')).toBeEnabled();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('dialog').getByRole('switch', { name: 'Material change' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByText('Version 2 is published.')).toBeVisible();
    await expect(
      versions.getByRole('link', { name: /Version 2.*Published.*Material change/ }),
    ).toBeVisible();
    await expect(versions.getByRole('link', { name: /Version 1.*Retired/ })).toBeVisible();

    await page.goto(`/t/${w.A.tenantId}/safety/acknowledgements`);
    const row = page.getByRole('row', { name: /Jan Kowalski/ });
    await expect(row.getByText('Outdated')).toBeVisible();
  });

  test('the package limit stops a new briefing, and archiving frees a place', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await overrideEntitlement(w, w.A, 'safety.max_briefing_templates', 1);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/safety/briefings`);

    await page.getByRole('button', { name: 'New briefing' }).first().click();
    await page.getByRole('dialog').getByLabel('Name').fill('Only rules');
    await page.getByRole('dialog').getByRole('button', { name: 'Create and edit' }).click();
    await expect(page.getByRole('heading', { name: 'Only rules' })).toBeVisible();

    await page.getByRole('link', { name: 'All briefings' }).click();
    await expect(page.getByText('1 of 1')).toBeVisible();
    await expect(
      page.getByText('Your package allows 1 briefings.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'New briefing' })).toBeDisabled();

    await page.getByRole('button', { name: 'Actions for Only rules' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await expect(page.getByText('Only rules is archived.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New briefing' }).first()).toBeEnabled();
  });
});
