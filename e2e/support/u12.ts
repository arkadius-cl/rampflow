import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  devices,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  addDays,
  firstInstantFrom,
  type LocalDate,
  type LocalTime,
  siteDay,
  type TimeZone,
} from '../../packages/shared/src/time/index.ts';
import { latestEmailTo, linkIn } from './mailpit.ts';

// Core loop fixtures (U12): one pinned time for the API and every browser, and one browser
// context per actor. Everything a person does goes through the UI.

const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;

/** A site-local wall time on `day` as an instant. */
export const siteInstant = (day: LocalDate, wallTime: string, zone: string): Date =>
  firstInstantFrom(day, wallTime as LocalTime, zone as TimeZone);

/** `wallTime` on the site-local day after today, as an instant, so the slot always lies ahead. */
export function nextSiteDayAt(zone: string, wallTime: string): { day: LocalDate; at: Date } {
  const day = addDays(siteDay(new Date(), zone as TimeZone), 1);
  return { day, at: siteInstant(day, wallTime, zone) };
}

/** Pins the API clock (requests and jobs); `null` hands it back to the wall clock. */
export async function pinApiClock(request: APIRequestContext, now: Date | null): Promise<void> {
  const res = await request.post('/api/test/clock', {
    data: { now: now?.toISOString() ?? null },
    headers: { Origin: APP_ORIGIN },
  });
  expect(res.status(), await res.text()).toBe(200);
}

export interface Actor {
  context: BrowserContext;
  page: Page;
}

/**
 * The shared timeline of a spec: the API clock and the clock of every actor's browser show the
 * same instant. Browser timers keep running, so polls still fire.
 */
export class Timeline {
  private readonly actors: Actor[] = [];
  now: Date;

  private readonly browser: Browser;
  private readonly request: APIRequestContext;

  constructor(browser: Browser, request: APIRequestContext, start: Date) {
    this.browser = browser;
    this.request = request;
    this.now = start;
  }

  async start(): Promise<void> {
    await pinApiClock(this.request, this.now);
  }

  /** A fresh browser for one person: an office desktop, a station tablet or a phone. */
  async actor(
    device: 'desktop' | 'tablet' | 'phone' = 'desktop',
    timezoneId = 'Europe/Berlin',
  ): Promise<Actor> {
    const use =
      device === 'phone'
        ? devices['Pixel 7']
        : device === 'tablet'
          ? { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } }
          : devices['Desktop Chrome'];
    const context = await this.browser.newContext({ ...use, timezoneId });
    await context.clock.setFixedTime(this.now);
    const actor = { context, page: await context.newPage() };
    this.actors.push(actor);
    return actor;
  }

  /** Moves the API clock and every browser clock to `at`. */
  async moveTo(at: Date): Promise<void> {
    this.now = at;
    await pinApiClock(this.request, at);
    for (const a of this.actors) await a.context.clock.setFixedTime(at);
  }

  /** Closes every browser; after a failure it first attaches what each actor saw. */
  async close(testInfo: TestInfo, failed: boolean): Promise<void> {
    if (failed) {
      for (const [i, a] of this.actors.entries()) {
        const path = testInfo.outputPath(`actor-${i}.png`);
        if (await a.page.screenshot({ path, fullPage: true }).catch(() => null)) {
          await testInfo.attach(`actor-${i}`, { path, contentType: 'image/png' });
        }
      }
    }
    for (const a of this.actors) await a.context.close();
    await pinApiClock(this.request, null);
  }
}

/** Opens an emailed invitation (`/invite#` or `/carrier-invite#`) in the actor's browser. */
export async function openEmailedLink(actor: Actor, email: string, path: string): Promise<void> {
  const link = new URL(linkIn((await latestEmailTo(email)).text, path));
  await actor.page.goto(link.pathname + link.hash);
}

/** Creates the account on an open invitation page and accepts it. */
export async function acceptWithNewAccount(page: Page, name: string): Promise<void> {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('New password').fill('core loop password 2026');
  await page.getByLabel('Repeat the password').fill('core loop password 2026');
  await page.getByRole('button', { name: 'Create account and accept' }).click();
}
