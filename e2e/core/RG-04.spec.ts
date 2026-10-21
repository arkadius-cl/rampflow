import { expect, test } from '@playwright/test';
import { TaxIdType } from '../../packages/shared/src/modules/core/values.ts';
import { expectAccessible, seedWorld } from '../support/auth.ts';
import { setTaxId, tenantFacts } from '../support/db.ts';
import {
  ownClientAddress,
  randomNip,
  register,
  registration,
  verificationLink,
} from '../support/signup.ts';

// The platform API does not expose `possible_duplicate` yet (the platform screens show it in
// 04), so the flag is read from the verify answer and the org row.

test.describe('RG-04 Register a company that may already use rampflow', () => {
  test('the hint names no tenant, and "Create company anyway" creates a flagged tenant', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    const vat = `PL${randomNip()}`;
    await setTaxId(w.A.tenantId, TaxIdType.eu_vat, vat);
    await ownClientAddress(page);
    const r = registration('rg04', { taxIdType: TaxIdType.eu_vat, taxIdValue: vat });
    await register(page, r);

    const inspected = page.waitForResponse('**/api/public/signups/inspect');
    await page.goto(await verificationLink(r.email));
    const inspect = await (await inspected).json();
    expect(inspect).toEqual({
      email: r.email,
      companyName: r.companyName,
      possibleDuplicate: true,
    });
    await expect(page.getByText('Your company may already use rampflow.')).toBeVisible();
    await expect(page.getByText('Ask its admin to invite you.')).toBeVisible();
    await expect(page.getByText(/Tenant A/)).toHaveCount(0);
    await expect(page.getByText(vat)).toHaveCount(0);
    await expectAccessible(page);

    const verified = page.waitForResponse('**/api/public/signups/verify');
    await page.getByRole('button', { name: 'Create company anyway' }).click();
    const answer = await (await verified).json();
    expect(answer).toMatchObject({ possibleDuplicate: true });
    await expect(page).toHaveURL(new RegExp(`/t/${answer.tenantId}$`));
    expect(await tenantFacts(answer.tenantId)).toMatchObject({
      possible_duplicate: true,
      activated_at: null,
      tax_id_value: vat,
    });
  });
});
