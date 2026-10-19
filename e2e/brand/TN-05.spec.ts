import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { PNG, SVG } from '../support/u3.ts';

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
});
