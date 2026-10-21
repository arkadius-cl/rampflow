import { SignupStatus } from '@rampflow/shared/modules/core/values';
import { OrgKind } from '@rampflow/shared/values';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.ts';
import { tenantSignup } from '../../src/modules/core/schema.signup.ts';
import { org } from '../../src/modules/core/schema.ts';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { as } from '../../test/http.ts';
import { DEMO_PASSWORD, seed as seedCore } from './core.ts';
import { ELBE_EMAIL, SIGNUP_TENANTS, seed, WESER_COMPANY, WESER_EMAIL } from './signups.ts';

async function run(): Promise<string[]> {
  const lines: string[] = [];
  await ownerDb().transaction(async (tx) => {
    const ctx = { db: tx, log: (line: string) => lines.push(line) };
    await seedCore(ctx);
    await seed(ctx);
  });
  return lines;
}

const rowsOf = (email: string) =>
  ownerDb().select().from(tenantSignup).where(eq(tenantSignup.email, email));

describe('pnpm db:seed, signups', () => {
  it('converges when run twice: onboarding tenants, one working Weser link, Elbe expired', async () => {
    await run();
    const counts = async () => ({
      orgs: await ownerCount('org'),
      users: await ownerCount('app_user'),
      memberships: await ownerCount('membership'),
      weser: await ownerCount('tenant_signup', sql`email = ${WESER_EMAIL}`),
      elbe: await ownerCount('tenant_signup', sql`email = ${ELBE_EMAIL}`),
    });
    const before = await counts();
    const lines = await run();
    expect(await counts()).toEqual(before);

    for (const t of SIGNUP_TENANTS) {
      const tenants = await ownerDb()
        .select()
        .from(org)
        .where(sql`${org.kind} = ${OrgKind.tenant} and ${org.name} = ${t.name}`);
      expect(tenants, t.name).toHaveLength(1);
      expect(tenants[0]).toMatchObject({
        activatedAt: null,
        taxIdValue: t.taxId.value,
        taxIdStatus: t.taxId.status,
        possibleDuplicate: t.possibleDuplicate,
      });
      const login = await as(app, null).post('/api/auth/login', {
        body: { email: t.admin.email, password: DEMO_PASSWORD },
      });
      expect(login.status, t.admin.email).toBe(200);
    }

    const weser = await rowsOf(WESER_EMAIL);
    expect(weser.map((r) => r.status).sort()).toEqual([
      SignupStatus.pending_email,
      SignupStatus.superseded,
    ]);
    const [elbe, ...moreElbe] = await rowsOf(ELBE_EMAIL);
    expect(moreElbe).toEqual([]);
    expect(elbe?.status).toBe(SignupStatus.pending_email);
    expect(elbe?.expiresAt.getTime()).toBeLessThan(Date.now());

    const link = lines.find((l) => l.includes('/signup/verify#'));
    const token = link?.split('#')[1] ?? '';
    const res = await as(app, null).post('/api/public/signups/verify', { body: { token } });
    expect(res.status).toBe(200);
    expect(await ownerCount('org', sql`kind = ${OrgKind.tenant} and name = ${WESER_COMPANY}`)).toBe(
      1,
    );
  });
});
