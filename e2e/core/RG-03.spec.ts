import { expect, test } from '@playwright/test';
import { seedWorld } from '../support/auth.ts';
import { signupsOf } from '../support/db.ts';
import { latestEmailTo } from '../support/mailpit.ts';
import { ownClientAddress, register, registration } from '../support/signup.ts';

test.describe('RG-03 Register with an email that has an account', () => {
  test('shows the same sent screen and emails "you already have an account"', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    const known = w.A.users.carrier_admin.email;
    await ownClientAddress(page);
    await register(page, registration('rg03', { email: known }));
    await expect(page.getByText(known)).toBeVisible();

    const mail = await latestEmailTo(known);
    expect(mail.subject).toBe('You already have a rampflow account');
    expect(mail.text).toContain('/login');
    expect(mail.text).not.toContain('/signup/verify');
    expect(await signupsOf(known)).toEqual([]);
  });
});
