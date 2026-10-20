import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { StaffLocale } from '../../packages/shared/src/values/locales.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { overrideEntitlement } from '../support/u5.ts';
import { REFERENCE_DAY, seedReferenceVisits, setLocale } from '../support/u11.ts';

/** Clicks an export button and returns the file's lines after checking the UTF-8 BOM. */
async function exported(page: Page, button: string): Promise<string[]> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: button }).click();
  const file = await readFile(await (await download).path());
  expect([...file.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  return file.subarray(3).toString('utf8').split('\r\n');
}

test.describe('RP-02 CSV export', () => {
  test('exports the KPIs and visits with the user delimiter and the site offset', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const codes = await seedReferenceVisits(w.A);
    const query = `site=${w.A.sites[0]?.id}&from=${REFERENCE_DAY}&to=${REFERENCE_DAY}`;
    await signInAs(context, w.A.users.dispatcher);

    await page.goto(`/t/${w.A.tenantId}/reports?${query}`);
    const kpisEn = await exported(page, 'KPIs as CSV');
    expect(kpisEn[0]).toBe('Site,From,To,KPI,Value,Unit');
    expect(kpisEn).toContain(`Site 1,${REFERENCE_DAY},${REFERENCE_DAY},No-show rate,25.0,%`);
    expect(kpisEn).toContain(`Site 1,${REFERENCE_DAY},${REFERENCE_DAY},Turnaround,82.5,min`);

    const visits = await exported(page, 'Visits as CSV');
    const header = visits[0]?.split(',') ?? [];
    const v1 = visits.find((l) => l.startsWith(`${codes[0]},`))?.split(',') ?? [];
    expect(v1[header.indexOf('Start')]).toBe(`${REFERENCE_DAY}T08:00:00+01:00`);
    expect(v1[header.indexOf('Checked in')]).toBe(`${REFERENCE_DAY}T07:50:00+01:00`);
    expect(visits.filter(Boolean)).toHaveLength(11);

    await setLocale(w.A.users.dispatcher.id, StaffLocale.de);
    await page.goto(`/t/${w.A.tenantId}/reports?${query}`);
    await expect(page.getByRole('heading', { name: 'Auswertungen' })).toBeVisible();
    const kpisDe = await exported(page, 'Kennzahlen als CSV');
    expect(kpisDe[0]).toBe('Standort;Von;Bis;Kennzahl;Wert;Einheit');
    expect(kpisDe).toContain(`Site 1;${REFERENCE_DAY};${REFERENCE_DAY};No-Show-Quote;25,0;%`);
  });

  test('offers no export without report.export', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await overrideEntitlement(w, w.A, 'report.export', false);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/reports`);
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'KPIs as CSV' })).toHaveCount(0);
    await expectAccessible(page);
  });
});
