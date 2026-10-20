import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { templateContent } from '../../apps/api/src/modules/safety/template/platform.ts';
import { DriverLocale } from '../../packages/shared/src/values/locales.ts';
import { DeviceClass } from '../../packages/shared/src/values/ui.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { uniqueEmail } from '../support/db.ts';
import { linkIn } from '../support/mailpit.ts';
import { emailMatching } from '../support/u7.ts';
import { dayButton } from '../support/u8.ts';
import {
  type Actor,
  acceptWithNewAccount,
  nextSiteDayAt,
  openEmailedLink,
  siteInstant,
  Timeline,
} from '../support/u12.ts';

const ZONE = 'Europe/Berlin';
/** The en quiz of the platform template the admin publishes unchanged. */
const QUIZ = templateContent(DriverLocale.en, { quiz: true }).questions;
const SITE = 'Lager Garching';
/** The booking horizon the walk-through pins at the site, as the settings field shows it. */
const HORIZON_DAYS = '30';

type SettingRow = ReturnType<Page['getByTestId']>;

/** Saves one setting on /t/$orgId/settings at the site level. */
async function setSiteValue(page: Page, key: string, set: (row: SettingRow) => Promise<void>) {
  const row = page.getByTestId(`setting-${key}`);
  await set(row);
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row).toContainText('Set here (Site)');
}

/** The wizard names each site with its zone abbreviation, which depends on the date. */
async function pickSite(page: Page) {
  const select = page.getByLabel('Site', { exact: true });
  const value = await select.locator('option', { hasText: SITE }).getAttribute('value');
  await select.selectOption(value ?? '');
}

async function readRulesAndAnswer(page: Page, right: boolean) {
  const toQuiz = page.getByRole('button', { name: 'I have read this. Go to the quiz' });
  await expect(page.getByRole('progressbar', { name: 'Briefing progress' })).toBeVisible();
  while (!(await toQuiz.isVisible())) await page.getByRole('button', { name: 'Next rule' }).click();
  await toQuiz.click();
  await expect(page.getByRole('heading', { name: 'Quick check' })).toBeVisible();
  for (const q of QUIZ) {
    const pick = right ? q.correct : (q.correct + 1) % q.options.length;
    await page.getByRole('radio', { name: q.options[pick], exact: true }).check();
  }
  await page.getByRole('button', { name: 'Check answers' }).click();
}

test.describe('Core loop', () => {
  test('a tenant goes from its creation to the KPIs of its first visit, across every role', async ({
    browser,
    request,
  }) => {
    test.setTimeout(600_000);
    const w = await seedWorld(request);
    const { day, at } = nextSiteDayAt(ZONE, '09:50');
    const time = (hhmm: string) => siteInstant(day, hhmm, ZONE);
    const timeline = new Timeline(browser, request, at);
    await timeline.start();
    const tenantName = `Acme ${Date.now().toString(36)}`;
    const email = {
      admin: uniqueEmail('cl-admin'),
      dispatcher: uniqueEmail('cl-dispatcher'),
      gate: uniqueEmail('cl-gate'),
      dock: uniqueEmail('cl-dock'),
      carrier: uniqueEmail('cl-carrier'),
      driver: uniqueEmail('cl-driver'),
    };
    let tenantId = '';
    let siteId = '';
    let carrierId = '';
    let code = '';
    let driver: Actor;
    let failed = true;
    try {
      await test.step('1. the platform admin creates the tenant on Pro', async () => {
        const platform = await timeline.actor();
        await signInAs(platform.context, w.platformAdmin);
        const page = platform.page;
        await page.goto('/platform/tenants');
        await page.getByRole('button', { name: 'Create tenant' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Company name').fill(tenantName);
        await dialog.getByLabel('Package').selectOption('pro');
        await dialog.getByLabel('Admin email').fill(email.admin);
        await dialog.getByRole('button', { name: 'Create and invite' }).click();
        await expect(page.getByRole('heading', { name: tenantName })).toBeVisible();
        tenantId = /\/platform\/tenants\/([0-9a-f-]+)$/.exec(page.url())?.[1] as string;
        await page.getByRole('button', { name: 'Expand all' }).click();
        await expect(page.getByTestId('entitlement-safety.gate_enforcement')).toContainText('On');
        await expectAccessible(page);
      });

      const admin = await timeline.actor();
      await test.step('2. the tenant admin sets up the site, the briefing and invites a carrier', async () => {
        const page = admin.page;
        await openEmailedLink(admin, email.admin, '/invite#');
        await acceptWithNewAccount(page, 'Ada Admin');
        await expect(page).toHaveURL(new RegExp(`/t/${tenantId}`));

        await page.goto(`/t/${tenantId}/sites`);
        await page.getByRole('button', { name: 'New site' }).first().click();
        const sheet = page.getByRole('dialog');
        await sheet.getByLabel('Name', { exact: true }).fill(SITE);
        await sheet.getByLabel('Street and number').fill('Industriestr. 5');
        await sheet.getByLabel('Postal code').fill('85748');
        await sheet.getByLabel('City').fill('Garching');
        await sheet.getByLabel('Time zone').selectOption(ZONE);
        await sheet.getByRole('button', { name: 'Create site' }).click();
        await expect(page.getByRole('heading', { name: SITE })).toBeVisible();
        siteId = /\/sites\/([0-9a-f-]+)/.exec(page.url())?.[1] as string;

        await page.getByRole('button', { name: 'New hall' }).click();
        await page.getByRole('dialog').getByLabel('Hall name').fill('Hall A');
        await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
        const hall = page.locator('[data-slot="card"]', {
          has: page.getByText('Hall A', { exact: true }),
        });
        for (const dock of ['D-01', 'D-02']) {
          await hall.getByRole('button', { name: 'Dock', exact: true }).click();
          await page.getByRole('dialog').getByLabel('Code').fill(dock);
          await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
          await expect(hall.getByRole('row', { name: new RegExp(dock) })).toBeVisible();
        }
        await page.getByRole('button', { name: 'New pool' }).click();
        await page.getByLabel('Name', { exact: true }).fill('Ramp pool');
        await page.getByRole('checkbox', { name: 'D-01', exact: true }).check();
        await page.getByRole('checkbox', { name: 'D-02', exact: true }).check();
        await page.getByRole('button', { name: 'Create pool' }).click();
        await expect(page.getByText('Ramp pool saved')).toBeVisible();
        await expectAccessible(page);

        await page.getByRole('link', { name: 'Hours and closures' }).click();
        for (const weekday of [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ]) {
          await page.getByRole('button', { name: `Add a window on ${weekday}` }).click();
          await page.getByLabel(`${weekday} opens`).fill('00:00');
          await page.getByLabel(`${weekday} closes`).fill('24:00');
        }
        await page.getByRole('button', { name: 'Save hours' }).click();
        await expect(page.getByText('Hours saved')).toBeVisible();
        await expectAccessible(page);

        await page.getByRole('link', { name: 'Load types' }).click();
        await page.getByRole('button', { name: 'New load type' }).click();
        const lt = page.getByRole('dialog');
        await lt.getByLabel('Name (German)').fill('Palettenware 45');
        await lt.getByLabel('Name (English)').fill('Pallets 45');
        await lt.getByRole('spinbutton', { name: 'Duration' }).fill('45');
        await lt.getByRole('checkbox', { name: 'Ramp pool' }).check();
        await lt.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText('Load type saved')).toBeVisible();
        const row = page.getByRole('row', { name: /Pallets 45/ });
        await expect(row).toContainText('45 min');
        await expect(row).toContainText('Ramp pool');
        await expect(row).toContainText('Can book');

        await page.goto(`/t/${tenantId}/settings`);
        await page.getByRole('tab', { name: SITE }).click();
        await setSiteValue(page, 'booking.min_lead_minutes', (r) =>
          r.getByRole('spinbutton').fill('0'),
        );
        // The row offers "Save" only for a changed value; an inherited 30 already pins it.
        const horizon = page.getByTestId('setting-booking.horizon_days').getByRole('spinbutton');
        await expect(horizon).not.toHaveValue('');
        if ((await horizon.inputValue()) !== HORIZON_DAYS) {
          await setSiteValue(page, 'booking.horizon_days', (r) =>
            r.getByRole('spinbutton').fill(HORIZON_DAYS),
          );
        }
        await expect(horizon).toHaveValue(HORIZON_DAYS);
        await setSiteValue(page, 'booking.slot_grid_minutes', async (r) => {
          await r.getByRole('combobox').selectOption('15');
        });
        await setSiteValue(page, 'booking.close_on_public_holidays', async (r) => {
          await r.getByRole('switch').click();
          await expect(r.getByRole('switch')).not.toBeChecked();
        });
        await expectAccessible(page);

        await page.goto(`/t/${tenantId}/safety/briefings`);
        await page.getByRole('button', { name: 'New briefing' }).first().click();
        await page.getByRole('dialog').getByLabel('Name').fill('Garching yard rules');
        await page.getByRole('dialog').getByRole('button', { name: 'Create and edit' }).click();
        await expect(page.getByRole('heading', { name: 'Garching yard rules' })).toBeVisible();
        await page.getByRole('button', { name: 'Publish', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Publish now' }).click();
        await expect(page.getByText('Version 1 is published.')).toBeVisible();
        await expectAccessible(page);

        await page.goto(`/t/${tenantId}/staff`);
        for (const [role, address, siteBound] of [
          ['dispatcher', email.dispatcher, false],
          ['gate_operator', email.gate, true],
          ['dock_operator', email.dock, true],
        ] as const) {
          await page.getByRole('button', { name: 'Invite' }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Email').fill(address);
          await dialog.getByLabel('Role').selectOption(role);
          if (siteBound) await dialog.getByRole('checkbox', { name: SITE }).check();
          await dialog.getByRole('button', { name: 'Send invitation' }).click();
          await expect(page.getByRole('row', { name: new RegExp(address) })).toBeVisible();
        }
        await expectAccessible(page);

        await page.goto(`/t/${tenantId}/carriers`);
        await page.getByRole('button', { name: 'Invite carrier' }).click();
        const invite = page.getByRole('dialog');
        await invite.getByLabel('Company name').fill('Spedition Nowak');
        await invite.getByLabel('Email', { exact: true }).fill(email.carrier);
        await invite.getByRole('button', { name: 'Send invitation' }).click();
        await expect(page.getByText(`Invitation sent to ${email.carrier}`)).toBeVisible();
        await expectAccessible(page);
      });

      const carrier = await timeline.actor();
      await test.step('3. the carrier accepts, books 10:00 with the avis and emails the driver link', async () => {
        const page = carrier.page;
        await openEmailedLink(carrier, email.carrier, '/carrier-invite#');
        await expect(page.getByLabel('Company name')).toHaveValue('Spedition Nowak');
        await expectAccessible(page);
        await acceptWithNewAccount(page, 'Piotr Nowak');
        await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/tenants$/);
        carrierId = /\/c\/([0-9a-f-]{36})\//.exec(page.url())?.[1] as string;

        await page.goto(`/c/${carrierId}/book`);
        await pickSite(page);
        await page.getByRole('radio', { name: /Pallets 45/ }).check();
        await page.getByLabel('Load units', { exact: true }).fill('18');
        await expect(page.getByText('18 load units take 45 minutes at this site.')).toBeVisible();
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByRole('heading', { name: 'When' })).toBeVisible();
        await dayButton(page, day).click();
        await page.getByRole('button', { name: '10:00', exact: true }).click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByRole('heading', { name: 'Avis' })).toBeVisible();
        await page.getByLabel('Reference 1', { exact: true }).fill('PO-4711');
        await page.getByLabel('Supplier').fill('Elektro Nord AG');
        await expectAccessible(page);
        await page.getByRole('button', { name: 'Confirm booking' }).click();
        await expect(
          page.getByRole('heading', { name: 'Booked. The warehouse expects you.' }),
        ).toBeVisible();
        code = ((await page.getByTestId('booking-code').textContent()) ?? '').trim();
        expect(code).toMatch(/^[0-9A-Z]{8}$/);

        await page.getByRole('link', { name: 'Open booking' }).click();
        // The confirmation page has its own driver link card; fill the one on the booking page.
        await expect(page).toHaveURL(/\/c\/[^/]+\/bookings\/[^/?#]+$/);
        await page.getByLabel('Email to driver').fill(email.driver);
        await page.getByLabel("Driver's language").selectOption('en');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText(`Link sent to ${email.driver}`)).toBeVisible();
        await expectAccessible(page);
      });

      const gate = await timeline.actor(DeviceClass.tablet);
      const gateRow = () => gate.page.getByTestId('gate-row').filter({ hasText: code });
      await test.step('4. the gate finds the booking; check-in waits for the briefing', async () => {
        const page = gate.page;
        await openEmailedLink(gate, email.gate, '/invite#');
        await acceptWithNewAccount(page, 'Gina Gate');
        await expect(page).toHaveURL(new RegExp(`/t/${tenantId}`));
        await page.goto(`/t/${tenantId}/gate?site=${siteId}`);
        await page.getByRole('textbox', { name: 'Find booking' }).fill(code);
        await page.getByRole('textbox', { name: 'Find booking' }).press('Enter');
        // A unique code is what a scan types: the check-in opens at once.
        await expect(gateRow()).toContainText('Briefing missing');
        const dialog = page.getByRole('dialog', { name: 'Check in Spedition Nowak' });
        await expect(dialog.getByRole('button', { name: 'Check in now' })).toBeDisabled();
        await expect(
          dialog.getByText('Check-in is disabled until a valid briefing is linked.'),
        ).toBeVisible();
        await expectAccessible(page);
        await dialog.getByRole('button', { name: 'Cancel' }).click();
      });

      driver = await timeline.actor(DeviceClass.phone);
      await test.step('5. the driver opens the link, fails the quiz once, passes and acknowledges', async () => {
        const page = driver.page;
        const mail = await emailMatching(email.driver, new RegExp(code));
        const link = new URL(linkIn(mail.text, '/d#'));
        await page.goto(link.pathname + link.hash);
        await expect(page.getByTestId('booking-code')).toHaveText(code);
        await expect(page.getByRole('heading', { name: 'Safety briefing required' })).toBeVisible();
        await expectAccessible(page);
        await page.getByRole('button', { name: 'Start safety briefing' }).click();
        await readRulesAndAnswer(page, false);
        await expect(page.getByText('Some answers were not correct.')).toBeVisible();
        await readRulesAndAnswer(page, true);
        await expect(page.getByRole('heading', { name: 'Confirm the briefing' })).toBeVisible();
        await page.getByLabel('Your name').fill('Jan Kowalski');
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Confirm briefing' }).click();
        await expect(page.getByTestId('safety-valid')).toContainText('Safety briefing valid until');
        await expectAccessible(page);
      });

      await test.step('6. gate, dock and driver run the visit from 09:55 to 11:00', async () => {
        await timeline.moveTo(time('09:55'));
        await gate.page.reload();
        await gate.page.getByRole('textbox', { name: 'Find booking' }).fill(code);
        await gate.page.getByRole('textbox', { name: 'Find booking' }).press('Enter');
        await expect(gateRow()).toContainText('Briefing valid');
        const checkIn = gate.page.getByRole('dialog', { name: 'Check in Spedition Nowak' });
        await expect(checkIn.getByText('On time')).toBeVisible();
        await checkIn.getByRole('button', { name: 'Check in now' }).click();
        await expect(gate.page.getByText('Spedition Nowak is checked in.')).toBeVisible();
        await expect(driver.page.getByRole('heading', { name: 'Please wait' })).toBeVisible({
          timeout: 20_000,
        });

        const dock = await timeline.actor(DeviceClass.tablet);
        await openEmailedLink(dock, email.dock, '/invite#');
        await acceptWithNewAccount(dock.page, 'Dirk Dock');
        await expect(dock.page).toHaveURL(new RegExp(`/t/${tenantId}`));
        await timeline.moveTo(time('10:05'));
        await dock.page.goto(`/t/${tenantId}/docks?site=${siteId}`);
        await dock.page
          .getByTestId('queue-item')
          .filter({ hasText: 'Spedition Nowak' })
          .getByRole('button', { name: 'Call to dock' })
          .click();
        const call = dock.page.getByRole('dialog', { name: 'Call Spedition Nowak to a dock' });
        await expectAccessible(dock.page);
        await call.getByRole('button', { name: 'Call to D-01' }).click();
        await expect(dock.page.getByText('Spedition Nowak called to D-01.')).toBeVisible();
        // The PWA's own 15-second poll, without a nudge: the call shows within 20 seconds.
        await expect(driver.page.getByTestId('dock-code')).toHaveText('D-01', { timeout: 20_000 });
        await expect(driver.page.getByText('Go to dock D-01, hall Hall A')).toBeVisible();
        await expectAccessible(driver.page);

        await dock.page
          .getByTestId('dock-D-01')
          .getByRole('button', { name: 'Other dock' })
          .click();
        const move = dock.page.getByRole('dialog', { name: 'Call Spedition Nowak to a dock' });
        await move.getByRole('button', { name: /^D-02/ }).click();
        await move.getByRole('button', { name: 'Call to D-02' }).click();
        await expect(dock.page.getByTestId('dock-D-02')).toContainText('Spedition Nowak');
        await expect(driver.page.getByTestId('dock-code')).toHaveText('D-02', { timeout: 20_000 });

        const bay = dock.page.getByTestId('dock-D-02');
        await timeline.moveTo(time('10:10'));
        // Each tap's next button shows once the API has stamped it, before the clock moves on.
        await bay.getByRole('button', { name: 'At dock' }).click();
        await expect(bay.getByRole('button', { name: 'Loading' })).toBeVisible();
        await timeline.moveTo(time('10:12'));
        await bay.getByRole('button', { name: 'Loading' }).click();
        await expect(bay.getByRole('button', { name: 'Loading' })).toHaveCount(0);
        await expect(bay).toContainText('Loading');
        await timeline.moveTo(time('10:50'));
        await bay.getByRole('button', { name: 'Done' }).click();
        const done = dock.page.getByRole('dialog', { name: 'Loading done: Spedition Nowak' });
        await expect(done.getByLabel('Actual load units')).toHaveValue('18');
        await done.getByLabel('Actual load units').fill('17');
        await done.getByLabel('Discrepancy note').fill('One pallet short');
        await done.getByRole('button', { name: 'Done' }).click();
        await expect(dock.page.getByTestId('dock-D-02')).toContainText('Free');
        await expectAccessible(dock.page);

        await timeline.moveTo(time('11:00'));
        await gate.page.goto(`/t/${tenantId}/gate?site=${siteId}&tab=onsite`);
        await gateRow().getByRole('button', { name: 'Check out' }).click();
        await gate.page
          .getByRole('dialog', { name: 'Check out Spedition Nowak' })
          .getByRole('button', { name: 'Check out' })
          .click();
        await expect(gate.page.getByText('Spedition Nowak has left.')).toBeVisible();
      });

      await test.step('7. the dispatcher reads and exports the KPIs of the day', async () => {
        const dispatcher = await timeline.actor();
        const page = dispatcher.page;
        await openEmailedLink(dispatcher, email.dispatcher, '/invite#');
        await acceptWithNewAccount(page, 'Dora Dispatch');
        await expect(page).toHaveURL(new RegExp(`/t/${tenantId}`));
        await page.goto(`/t/${tenantId}/reports?site=${siteId}&from=${day}&to=${day}`);
        await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
        const tile = (name: string) =>
          page.locator('[data-slot="card"]').filter({ has: page.getByText(name, { exact: true }) });
        const expected: [string, string][] = [
          ['Bookings due', '1'],
          ['No-show rate', '0.0 %'],
          ['Late cancellations', '0.0 %'],
          ['On time', '100.0 %'],
          ['Wait', '10.0 min'],
          ['Dock dwell', '40.0 min'],
          ['Turnaround', '65.0 min'],
          ['Portal adoption', '100.0 %'],
          ['Detention visits', '0'],
        ];
        for (const [name, value] of expected) await expect(tile(name)).toContainText(value);
        await expectAccessible(page);

        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'KPIs as CSV' }).click();
        const file = await readFile(await (await download).path());
        expect([...file.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        const lines = file.subarray(3).toString('utf8').split('\r\n');
        expect(lines[0]).toBe('Site,From,To,KPI,Value,Unit');
        for (const [kpi, value, unit] of [
          ['Bookings due', '1', 'count'],
          ['No-show rate', '0.0', '%'],
          ['Late cancellations', '0.0', '%'],
          ['On time', '100.0', '%'],
          ['Wait', '10.0', 'min'],
          ['Dock dwell', '40.0', 'min'],
          ['Turnaround', '65.0', 'min'],
          ['Portal adoption', '100.0', '%'],
          ['Detention visits', '0', 'count'],
        ]) {
          expect(lines).toContain(`${SITE},${day},${day},${kpi},${value},${unit}`);
        }
      });

      await test.step('8. a booking cancelled before the cutoff turns its driver link invalid', async () => {
        const page = carrier.page;
        await page.goto(`/c/${carrierId}/book`);
        await pickSite(page);
        await page.getByRole('radio', { name: /Pallets 45/ }).check();
        await page.getByLabel('Load units', { exact: true }).fill('6');
        await page.getByRole('button', { name: 'Continue' }).click();
        await dayButton(page, day).click();
        await page.getByRole('button', { name: '15:00', exact: true }).click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.getByLabel('Reference 1', { exact: true }).fill('PO-4712');
        await page.getByLabel('Supplier').fill('Elektro Nord AG');
        await page.getByRole('button', { name: 'Confirm booking' }).click();
        const second = ((await page.getByTestId('booking-code').textContent()) ?? '').trim();
        await page.getByRole('link', { name: 'Open booking' }).click();
        const link = new URL(await page.getByLabel('Link for the driver').inputValue());

        await driver.page.goto(link.pathname + link.hash);
        await expect(driver.page.getByTestId('booking-code')).toHaveText(second);

        await page.getByRole('button', { name: 'Cancel booking' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel booking' }).click();
        await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();

        await driver.page.reload();
        await expect(
          driver.page.getByRole('heading', { name: 'This link is no longer valid' }),
        ).toBeVisible();
        await expect(driver.page.getByText('Ask your dispatcher for a new one.')).toBeVisible();
      });
      failed = false;
    } finally {
      await timeline.close(test.info(), failed);
    }
  });
});
