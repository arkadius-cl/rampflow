#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';
// Walks the core loop of docs/tutorials/first-truck-end-to-end.md in the real app and captures the
// screens the docs embed to docs/assets/screens/<name>.png.
// Run `pnpm docs:screens` against a running `pnpm dev` with the dev seed (`pnpm db:seed`). It runs
// inside the Playwright container and starts nothing itself.
// Every run changes the demo data like the tutorial does: it switches the demo accounts to English
// and books one Trans-Pol truck at Hamburg DC, which it takes through the gate and a dock to departure.
// The onboarding capture needs Nordhafen without a dock, as `pnpm db:seed` leaves it.
import { OrgKind } from '../packages/shared/src/values/roles.ts';

const base = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const out = process.env.DOCS_SCREENS_OUT ?? 'docs/assets/screens';
const PASSWORD = 'rampflow-demo';

const DEVICES = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  tablet: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true },
  phone: { ...devices['Pixel 7'], deviceScaleFactor: 1 },
};

const ACCOUNTS = {
  admin: 'admin@acme.local',
  dispatcher: 'dispatch@acme.local',
  gate: 'gate@acme.local',
  dock: 'dock@acme.local',
  carrier: 'admin@trans-pol.local',
  platform: 'admin@rampflow.local',
  onboarding: 'admin@nordhafen.local',
};

// The dev servers render the TanStack devtools buttons; the docs show the app without them.
const HIDE_DEVTOOLS = `.tsqd-parent-container,
  button[aria-label="Open TanStack Router Devtools"] { display: none !important; }`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = new Map();
const sessions = new Map();

/** A page in its own browser context, signed in as `account` unless it is the driver. */
async function open(account, device) {
  const key = `${account}:${device}`;
  if (sessions.has(key)) return sessions.get(key);
  const context = await browser.newContext({
    ...DEVICES[device],
    colorScheme: 'light',
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
  });
  await context.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
    });
  }, HIDE_DEVTOOLS);
  const page = await context.newPage();
  page.on('pageerror', (e) => note(account, e.message));
  if (Object.hasOwn(ACCOUNTS, account)) {
    await page.goto(`${base}/login`);
    await page.getByLabel('Email').fill(ACCOUNTS[account]);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    const res = await page.request.patch(`${base}/api/me`, {
      data: { locale: 'en' },
      headers: { origin: base },
    });
    if (!res.ok()) throw new Error(`switching ${ACCOUNTS[account]} to English: ${res.status()}`);
  }
  sessions.set(key, page);
  return page;
}

function note(account, message) {
  errors.set(account, [...(errors.get(account) ?? []), message]);
}

async function json(page, path) {
  const res = await page.request.get(`${base}/api${path}`);
  if (!res.ok()) throw new Error(`GET ${path}: ${res.status()}`);
  return res.json();
}

async function shot(page, name, scrollTo) {
  await page.evaluate(() => document.fonts.ready);
  if (scrollTo) await scrollTo.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  const file = join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`ok   ${name} -> ${file}`);
}

async function goto(page, path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
}

/** The seeded tenant the screenshots show. */
const TENANT = 'Acme Logistics';
const admin = await open('admin', 'desktop');
const me = await json(admin, '/me');
const tenantId = me.memberships.find((m) => m.orgName === TENANT)?.orgId;
if (!tenantId) throw new Error(`${TENANT} is missing: run pnpm db:seed`);
const { sites } = await json(admin, `/t/${tenantId}/context`);
const siteId = (name) => {
  const site = sites.find((s) => s.name === name);
  if (!site) throw new Error(`site ${name} is missing: run pnpm db:seed`);
  return site.id;
};
const hamburgDc = siteId('Hamburg DC');
const lager = siteId('Lager Hamburg');

await goto(admin, `/t/${tenantId}/sites/${hamburgDc}`);
await shot(admin, 'master-data-site');
const onboarding = await open('onboarding', 'desktop');
const onboardingId = (await json(onboarding, '/me')).memberships.find(
  (m) => m.orgKind === OrgKind.tenant,
)?.orgId;
await goto(onboarding, `/t/${onboardingId}`);
await onboarding.waitForURL(/\/onboarding$/);
await onboarding.getByText('2 of 3 steps done').waitFor();
await shot(onboarding, 'onboarding');
await goto(admin, `/t/${tenantId}/settings`);
await admin.getByRole('tab', { name: 'Hamburg DC' }).click();
await shot(admin, 'settings', admin.getByRole('region', { name: 'Booking rules' }));

const carrier = await open('carrier', 'desktop');
const carrierId = (await json(carrier, '/me')).memberships.find(
  (m) => m.orgKind === OrgKind.carrier,
)?.orgId;
await goto(carrier, `/c/${carrierId}/book`);
const siteSelect = carrier.getByRole('combobox', { name: 'Site' });
const hamburgDcOption = siteSelect.locator('option', { hasText: /^Hamburg DC · / });
await siteSelect.selectOption((await hamburgDcOption.getAttribute('value')) ?? '');
await carrier.getByRole('radio', { name: /^Palletised Delivery/ }).check();
await carrier.getByLabel('Load units').fill('20');
await carrier.getByRole('button', { name: 'Continue' }).click();
const firstFreeDay = carrier.getByRole('button', { name: /: [1-9]\d* free$/ }).first();
await firstFreeDay.click();
await carrier
  .getByRole('button', { name: /^\d\d:\d\d$/ })
  .first()
  .waitFor();
await shot(carrier, 'carrier-booking-time');
await carrier
  .getByRole('button', { name: /^\d\d:\d\d$/ })
  .first()
  .click();
await carrier.getByRole('button', { name: 'Continue' }).click();
await carrier.getByLabel('Reference 1', { exact: true }).fill('PO-4711');
await carrier.getByLabel('Supplier').fill('Elektro Nord AG');
await carrier.getByLabel('Plate', { exact: true }).fill('PO 5TR22');
await carrier.getByLabel('Plate country').fill('PL');
await carrier.getByLabel('Driver name').fill('Tomasz Wiśniewski');
await carrier.getByLabel('Driver language').selectOption({ label: 'English' });
await carrier.getByRole('button', { name: 'Confirm booking' }).click();
const driverLink = carrier.getByRole('textbox', { name: 'Link for the driver' });
await driverLink.waitFor();
const driverUrl = await driverLink.inputValue();
const code = (
  await carrier.getByRole('img', { name: /^QR code of booking / }).getAttribute('aria-label')
)
  ?.split(' ')
  .at(-1);
await shot(carrier, 'carrier-booking-confirmed');
await goto(carrier, `/c/${carrierId}/bookings`);
await shot(carrier, 'carrier-bookings');

const driver = await open('driver', 'phone');
await driver.goto(driverUrl);
await driver.getByRole('button', { name: 'Start safety briefing' }).waitFor();
await shot(driver, 'driver-booking');
await driver.getByRole('button', { name: 'Start safety briefing' }).click();
await shot(driver, 'driver-briefing');
while (await driver.getByRole('button', { name: 'Next rule' }).isVisible()) {
  await driver.getByRole('button', { name: 'Next rule' }).click();
}
await driver.getByRole('button', { name: 'I have read this. Go to the quiz' }).click();
for (const answer of ['10 km/h', 'In the waiting area', 'When the staff release me']) {
  await driver.getByRole('radio', { name: answer }).check();
}
await driver.getByRole('button', { name: 'Check answers' }).click();
await driver.getByRole('textbox', { name: 'Your name' }).fill('Tomasz Wiśniewski');
await driver.getByRole('checkbox').check();
await driver.getByRole('button', { name: 'Confirm briefing' }).click();
await driver.getByText('Safety briefing valid until').waitFor();

const gate = await open('gate', 'tablet');
await goto(gate, `/t/${tenantId}/gate?site=${lager}&tab=onsite`);
await shot(gate, 'gate');
await goto(gate, `/t/${tenantId}/gate?site=${hamburgDc}`);
await gate.getByRole('textbox', { name: 'Find booking' }).fill(code);
await gate.keyboard.press('Enter');
await gate.getByRole('button', { name: 'Check in now' }).waitFor();
await shot(gate, 'gate-check-in');
await gate.getByRole('button', { name: 'Check in now' }).click();
await gate.getByRole('tab', { name: /On site/ }).waitFor();

const dock = await open('dock', 'tablet');
await goto(dock, `/t/${tenantId}/docks?site=${hamburgDc}`);
await dock.getByRole('button', { name: 'Call to dock' }).first().click();
await dock.getByRole('button', { name: /^Call to T\d+$/ }).click();
await dock.getByRole('button', { name: 'At dock' }).waitFor();
await shot(dock, 'docks');
await driver.reload();
await driver.getByRole('heading', { name: 'Go to dock' }).waitFor();
await shot(driver, 'driver-called');
await dock.getByRole('button', { name: 'At dock' }).click();
await dock.getByRole('button', { name: 'Loading' }).click();
await dock.getByRole('button', { name: 'Done' }).click();
await dock.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
await dock.getByText('No trucks waiting.').waitFor();

await goto(gate, `/t/${tenantId}/gate?site=${hamburgDc}&tab=onsite`);
await gate.getByRole('button', { name: 'Check out' }).first().click();
await gate.getByRole('dialog').getByRole('button', { name: 'Check out' }).click();
await gate.getByText(/has left\.$/).waitFor();

const dispatcher = await open('dispatcher', 'desktop');
await goto(dispatcher, `/t/${tenantId}/plan?site=${lager}`);
const now = dispatcher.getByRole('main').locator('time').last();
await now.evaluate((e) => e.scrollIntoView({ block: 'center' }));
await shot(dispatcher, 'plan-board');
await goto(dispatcher, `/t/${tenantId}/reports`);
await dispatcher.getByRole('combobox', { name: 'Site' }).selectOption({ label: 'Lager Hamburg' });
await dispatcher.getByRole('region', { name: /^KPIs for Lager Hamburg/ }).waitFor();
await shot(dispatcher, 'reports');

const platform = await open('platform', 'desktop');
await goto(platform, '/platform/tenants');
await shot(platform, 'platform-tenants');

await browser.close();
for (const [account, messages] of errors) console.log(`FAIL ${account}: ${messages.join(' | ')}`);
process.exit(errors.size ? 1 : 0);
