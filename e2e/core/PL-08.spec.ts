import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { MeResponse } from '../../packages/shared/src/modules/core/api.auth.ts';
import { TenantNoteKind } from '../../packages/shared/src/modules/core/values.ts';
import { seedWorld, signInAs } from '../support/auth.ts';
import {
  asPlatformAdmin,
  createTenant,
  expectAccessibleInBothThemes,
  reactivateTenant,
  suspendTenant,
} from '../support/u3.ts';

test.describe('PL-08 Tenant notes', () => {
  test('notes from the sheet sit above the suspension history, which filters by kind', async ({
    page,
    context,
    request,
  }) => {
    test.slow();
    const w = await seedWorld(request);
    const tenant = await createTenant(request, w, `PL08 ${randomUUID().slice(0, 8)}`);
    const { user: me } = (await (
      await request.get('/api/me', { headers: asPlatformAdmin(w) })
    ).json()) as MeResponse;
    await suspendTenant(request, w, tenant.id, 'Unpaid since March');
    await reactivateTenant(request, w, tenant.id, 'Paid in full');
    await signInAs(context, w.platformAdmin);
    const notesTab = `/platform/tenants/${tenant.id}/notes`;

    await page.goto(notesTab);
    const table = page.getByRole('table', { name: 'Notes' });
    const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows).toHaveCount(2);
    await expectAccessibleInBothThemes(page);

    // An empty note keeps the sheet open with the field error.
    await page.getByRole('button', { name: 'Add note' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add note' });
    await expect(sheet).toBeVisible();
    await expectAccessibleInBothThemes(page);
    await sheet.getByLabel('Note').fill('   ');
    await sheet.getByRole('button', { name: 'Add note' }).click();
    await expect(sheet.getByLabel('Note')).toHaveAttribute('aria-invalid', 'true');
    await expect(sheet.locator('[data-slot="field-error"]')).not.toBeEmpty();
    await expect(sheet).toBeVisible();

    // A note: the sheet closes with a toast, the note first with its author.
    await sheet.getByLabel('Note').fill('Asked for a second site');
    await sheet.getByRole('button', { name: 'Add note' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Note added.')).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByRole('cell')).toHaveText([
      /\d{4}, \d{2}:\d{2} \S+/,
      'Note',
      me.name,
      'Asked for a second site',
    ]);
    await expect(rows.nth(1).getByRole('cell').nth(1)).toHaveText('Reactivated');
    await expect(rows.nth(1).getByRole('cell').nth(3)).toHaveText('Paid in full');
    await expect(rows.nth(2).getByRole('cell').nth(1)).toHaveText('Suspended');
    await expect(rows.nth(2).getByRole('cell').nth(2)).toHaveText(me.name);

    // The kind filter in the URL keeps the suspension entries only.
    await page.goto(`${notesTab}?${new URLSearchParams({ kind: TenantNoteKind.suspended })}`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByRole('cell').nth(1)).toHaveText('Suspended');
    await expect(rows.first().getByRole('cell').nth(3)).toHaveText('Unpaid since March');
    await expect(page.getByRole('button', { name: /^Kind/ })).toContainText('Suspended');
  });
});
