import { expect, test } from '@playwright/test';
import { EuCountry, TaxIdType } from '../../packages/shared/src/modules/core/values.ts';
import { signupsOf } from '../support/db.ts';
import { fillSignup, ownClientAddress, register, registration } from '../support/signup.ts';

test.describe('RG-05 Enter a valid tax id', () => {
  test('a NIP with a wrong check digit is refused before anything is sent', async ({ page }) => {
    await ownClientAddress(page);
    const posts: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/public/signups'))
        posts.push(req.url());
    });
    const r = registration('rg05-nip', { taxIdValue: '5260250275' });
    await page.goto('/signup');
    await fillSignup(page, r);
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(
      page.getByText('The check digit of this number is wrong. Check for typos.'),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Tax number', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(posts).toEqual([]);
    expect(await signupsOf(r.email)).toEqual([]);
  });

  test('a Polish company is not offered the German tax number', async ({ page }) => {
    await page.goto('/signup');
    const types = page.getByLabel('Type of tax number');
    await page.getByLabel('Country').selectOption(EuCountry.PL);
    await expect(types.locator('option')).toHaveText(['EU VAT number', 'NIP']);
    await page.getByLabel('Country').selectOption(EuCountry.DE);
    await expect(types.locator('option')).toHaveText(['EU VAT number', 'Tax number or W-IdNr']);
  });

  test('a VAT number typed with spaces and without prefix is accepted and normalized', async ({
    page,
  }) => {
    await ownClientAddress(page);
    const r = registration('rg05-vat', {
      country: EuCountry.DE,
      taxIdType: TaxIdType.eu_vat,
      taxIdValue: '136 695 976',
    });
    await register(page, r);
    const [row] = await signupsOf(r.email);
    expect(row?.tax_id_value).toBe('DE136695976');
  });
});
