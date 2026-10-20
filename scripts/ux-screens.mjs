#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';
// Captures every design prototype screen at its target viewport.
// Run inside the Playwright container (see package.json "ux:screens") against a
// running Vite dev server on :5173. Output dir comes from UX_SCREENS_OUT.
import { ConsoleMessageType } from '../packages/shared/src/values/dom.ts';

const base = process.env.UX_SCREENS_BASE ?? 'http://localhost:5173';
const out = process.env.UX_SCREENS_OUT ?? '.audit/ux-screens';
const only = process.argv[2];

const desktop = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
const tablet = {
  viewport: { width: 1024, height: 768 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: false,
};
const phone = {
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
};

const screens = [
  ['00-index', '/design/', desktop],
  ['01-plan-board', '/design/plan-board', desktop],
  ['01b-plan-board-list', '/design/plan-board?view=list', desktop],
  ['02-booking-wizard-slot', '/design/booking-wizard?step=slot', desktop],
  ['02b-booking-wizard-avis', '/design/booking-wizard?step=avis', desktop],
  ['02c-booking-wizard-confirmed', '/design/booking-wizard?step=confirmed', desktop],
  ['03-carrier-bookings', '/design/carrier-bookings', desktop],
  ['04-gate', '/design/gate', tablet],
  ['04b-gate-checkin', '/design/gate?checkin=b5', tablet],
  ['05-dock', '/design/dock', tablet],
  ['05b-dock-call', '/design/dock?call=b4', tablet],
  ['06a-driver-booking', '/design/driver?step=booking', phone],
  ['06b-driver-briefing', '/design/driver?step=briefing', phone],
  ['06c-driver-quiz', '/design/driver?step=quiz', phone],
  ['06d-driver-waiting', '/design/driver?step=waiting', phone],
  ['06e-driver-called', '/design/driver?step=called', phone],
  ['06f-driver-done', '/design/driver?step=done', phone],
  ['07-master-data', '/design/master-data', desktop],
  ['08-settings', '/design/settings', desktop],
  ['09-platform-admin', '/design/platform-admin', desktop],
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
for (const [name, path, ctx] of screens) {
  if (only && !name.includes(only)) continue;
  const context = await browser.newContext({ ...ctx, colorScheme: 'light', locale: 'en-GB' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === ConsoleMessageType.error && errors.push(m.text()));
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const file = join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  if (errors.length) {
    failures++;
    console.log(`FAIL ${name}: ${errors.join(' | ')}`);
  } else {
    console.log(`ok   ${name} -> ${file}`);
  }
  await context.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
