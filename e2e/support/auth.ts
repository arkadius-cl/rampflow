import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, type BrowserContext, expect, type Page } from '@playwright/test';

// Seeding, sign-in and accessibility helpers shared by every staff spec. Units add their own
// helpers in e2e/support/<unit>.ts.

const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;

export interface WorldUser {
  id: string;
  email: string;
  role: string;
  sessionToken: string;
}

export type WorldUserKey =
  | 'tenant_admin'
  | 'dispatcher'
  | 'gate_operator'
  | 'dock_operator'
  | 'gate_operator_other_site'
  | 'dock_operator_other_site'
  | 'carrier_admin'
  | 'carrier_user'
  | 'rival_admin'
  | 'rival_user';

export interface WorldSide {
  tenantId: string;
  carrierId: string;
  rivalCarrierId: string;
  sites: { id: string }[];
  users: Record<WorldUserKey, WorldUser>;
}

export interface World {
  platformOrgId: string;
  platformAdmin: WorldUser;
  A: WorldSide;
  B: WorldSide;
}

/** Two fresh tenant worlds through POST /api/test/seed (apps/api/test/world.ts). */
export async function seedWorld(request: APIRequestContext): Promise<World> {
  const res = await request.post('/api/test/seed', {
    data: { scenario: 'world' },
    headers: { Origin: APP_ORIGIN },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as World;
}

/** Signs a browser context in as a seeded user by setting their session cookie. */
export async function signInAs(context: BrowserContext, user: WorldUser): Promise<void> {
  await context.addCookies([
    {
      name: 'rf_session',
      value: user.sessionToken,
      url: APP_ORIGIN,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/** Signs in through the /login form. */
export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** No serious or critical axe violation on the current page (scope NFR, WCAG 2.2 AA). */
export async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}
