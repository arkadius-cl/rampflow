import { devices, expect, type Locator, type Page, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { uniqueEmail } from '../support/db.ts';
import { linkIn } from '../support/mailpit.ts';
import { PNG, SVG } from '../support/u3.ts';
import { setSiteSetting } from '../support/u7.ts';
import { APP_ORIGIN, driverWorld, linkOf, ownAddress } from '../support/u10.ts';

const MAILPIT = `http://${process.env.SMTP_HOST ?? 'localhost'}:8025`;

/** The newest email to `to` as Mailpit stores it, waiting for the outbox worker. */
async function emailTo(to: string): Promise<{ html: string; text: string }> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        id = ((await res.json()) as { messages: { ID: string }[] }).messages[0]?.ID;
        return id !== undefined;
      },
      { timeout: 30_000, message: `an email to ${to}` },
    )
    .toBe(true);
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    HTML: string;
    Text: string;
  };
  return { html: message.HTML, text: message.Text };
}

/** The logo at `src` is inside `scope` and loaded. */
async function expectLogo(scope: Page | Locator, src: string) {
  const logo = scope.locator(`img[src="${src}"]`);
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((img) => (img as { naturalWidth: number }).naturalWidth))
    .toBe(1);
}

test.describe('TN-05 Logo', () => {
  test('the admin uploads a PNG and sees it; SVG is refused; the logo can be deleted', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);

    await page.goto(`/t/${w.A.tenantId}/brand`);
    await expect(page.getByText('No logo yet.', { exact: false })).toBeVisible();
    await expectAccessible(page);

    const file = page.getByLabel('Image file');
    const upload = page.getByRole('button', { name: 'Upload logo' });
    await file.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await upload.click();
    const preview = page.getByRole('img', { name: 'Your current logo' });
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((img) => (img as { naturalWidth: number }).naturalWidth))
      .toBe(1);

    await file.setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: SVG });
    await expect(page.getByText('Choose a PNG or JPEG image.', { exact: false })).toBeVisible();
    await expect(upload).toBeDisabled();

    // An SVG renamed to .png passes the browser's check; the server reads the bytes.
    await file.setInputFiles({ name: 'renamed.png', mimeType: 'image/png', buffer: SVG });
    await expect(upload).toBeEnabled();
    await upload.click();
    await expect(page.getByText('Choose a PNG or JPEG image.', { exact: false })).toBeVisible();
    await expect(preview).toBeVisible();

    await page.getByRole('button', { name: 'Delete logo' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete logo' }).click();
    await expect(page.getByText('No logo yet.', { exact: false })).toBeVisible();
  });

  test('the logo appears on the public link, the carrier invitation and its email, the carrier portal and the driver PWA', async ({
    browser,
    page,
    context,
    request,
  }) => {
    // Waits for an outbox tick (every 5 seconds) on a shared machine.
    test.setTimeout(120_000);
    const w = await driverWorld(request);
    await signInAs(context, w.A.users.tenant_admin);

    await page.goto(`/t/${w.A.tenantId}/brand`);
    await page
      .getByLabel('Image file')
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Upload logo' }).click();
    const src = await page
      .getByRole('img', { name: 'Your current logo' })
      .getAttribute('src', { timeout: 15_000 });
    expect(src).toMatch(new RegExp(`^/api/public/logos/${w.A.tenantId}/[0-9a-f]{64}$`));
    const logoSrc = src as string;

    await page.goto(`/t/${w.A.tenantId}/carriers?tab=links`);
    await page.getByRole('button', { name: 'Create link' }).first().click();
    const shown = page.getByTestId('public-link').first();
    await expect(shown).toBeVisible();
    const slug = (await shown.innerText()).split('/r/')[1] as string;
    await setSiteSetting({
      tenantId: w.A.tenantId,
      siteId: w.A.sites[0]?.id as string,
      key: 'booking.public_link_enabled',
      value: true,
      by: w.A.users.tenant_admin.id,
    });

    await page.goto(`/t/${w.A.tenantId}/carriers`);
    const email = uniqueEmail('logo');
    await page.getByRole('button', { name: 'Invite carrier' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Company name').fill('Baltic Freight UAB');
    await dialog.getByLabel('Email', { exact: true }).fill(email);
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();

    const visitor = await browser.newContext();
    const tab = await visitor.newPage();
    await tab.goto(`/r/${slug}`);
    await expect(tab.getByRole('button', { name: 'Register' })).toBeVisible();
    await expectLogo(tab, logoSrc);
    await expectAccessible(tab);

    const mail = await emailTo(email);
    expect(mail.html).toContain(`src="${APP_ORIGIN}${logoSrc}"`);
    const invite = new URL(linkIn(mail.text, '/carrier-invite#'));
    await tab.goto(`${invite.pathname}${invite.hash}`);
    await expect(tab.getByText('Baltic Freight UAB', { exact: false }).first()).toBeVisible();
    await expectLogo(tab, logoSrc);
    await expectAccessible(tab);
    await visitor.close();

    const carrier = await browser.newContext();
    await signInAs(carrier, w.A.users.carrier_user);
    const portal = await carrier.newPage();
    await portal.goto(`/c/${w.A.carrierId}/book?tenant=${w.A.tenantId}`);
    await expectLogo(portal.getByRole('complementary'), logoSrc);
    await expectAccessible(portal);
    await portal.goto(`/c/${w.A.carrierId}/bookings/${w.A.bookings.own.id}`);
    await expect(portal.getByRole('heading', { level: 1, name: /^Tenant A / })).toBeVisible();
    await expectLogo(portal, logoSrc);
    await expectAccessible(portal);
    await carrier.close();

    const phone = await browser.newContext({ ...devices['Pixel 7'] });
    const driver = await phone.newPage();
    await ownAddress(driver);
    await driver.goto(linkOf(w.A.bookings.own.driverToken));
    await expect(driver.getByTestId('booking-code')).toHaveText(w.A.bookings.own.code);
    await expectLogo(driver.getByRole('banner'), logoSrc);
    await expectAccessible(driver);
    await phone.close();
  });
});
