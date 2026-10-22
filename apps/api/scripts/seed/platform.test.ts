import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import { TenantNoteKind, TenantStatus } from '@rampflow/shared/modules/core/values';
import { ErrorCode, OrgKind, Role } from '@rampflow/shared/values';
import { and, asc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.ts';
import type { AnyOrgId } from '../../src/db/ids.ts';
import { appUser, invitation, membership, org, tenantNote } from '../../src/modules/core/schema.ts';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { as } from '../../test/http.ts';
import type { SeedContext } from './context.ts';
import { DEMO_PASSWORD, seed as seedCore } from './core.ts';
import { ELBE_COLD, ELBE_COLD_ADMIN, NOTES, RHEIN, RHEIN_ADMIN, seed } from './platform.ts';
import { NORDHAFEN, seed as seedSignups } from './signups.ts';

async function run(): Promise<string[]> {
  const lines: string[] = [];
  await ownerDb().transaction(async (tx) => {
    const ctx = { db: tx, log: (line: string) => lines.push(line) };
    await seedCore(ctx);
    await seedSignups(ctx);
    await seed(ctx);
  });
  return lines;
}

const tenantNamed = async (name: string) => {
  const rows = await ownerDb()
    .select()
    .from(org)
    .where(and(eq(org.kind, OrgKind.tenant), eq(org.name, name)));
  expect(rows, name).toHaveLength(1);
  return rows[0] as typeof org.$inferSelect;
};

const notesOf = (tenantId: AnyOrgId) =>
  ownerDb()
    .select({ kind: tenantNote.kind, body: tenantNote.body })
    .from(tenantNote)
    .where(eq(tenantNote.tenantId, tenantId as never))
    .orderBy(asc(tenantNote.createdAt));

describe('pnpm db:seed, platform', () => {
  it('converges when run twice: a suspended Rhein Lager, an invited Elbe admin, notes', async () => {
    await run();
    const counts = async () => ({
      orgs: await ownerCount('org'),
      users: await ownerCount('app_user'),
      memberships: await ownerCount('membership'),
      invitations: await ownerCount('invitation'),
      notes: await ownerCount('tenant_note'),
    });
    const before = await counts();
    await run();
    expect(await counts()).toEqual(before);

    const rhein = await tenantNamed(RHEIN);
    expect(tenantStatus(rhein)).toBe(TenantStatus.suspended);
    expect(rhein.activatedAt).not.toBeNull();
    expect(await notesOf(rhein.id)).toEqual(
      NOTES[RHEIN]?.map((n) => ({ kind: n.kind, body: n.body })),
    );
    const members = await ownerDb()
      .select({ role: membership.role, email: appUser.email, lastSeenAt: appUser.lastSeenAt })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(eq(membership.orgId, rhein.id));
    expect(members).toEqual([
      { role: Role.tenant_admin, email: RHEIN_ADMIN.email, lastSeenAt: expect.any(Date) },
    ]);

    const elbe = await tenantNamed(ELBE_COLD);
    expect(elbe).toMatchObject({ country: null, taxIdType: null, activatedAt: null });
    expect(await ownerCount('membership', sql`org_id = ${elbe.id}`)).toBe(0);
    const invitations = await ownerDb()
      .select()
      .from(invitation)
      .where(eq(invitation.orgId, elbe.id));
    expect(invitations).toEqual([
      expect.objectContaining({
        email: ELBE_COLD_ADMIN,
        role: Role.tenant_admin,
        acceptedAt: null,
        revokedAt: null,
      }),
    ]);
    expect(invitations[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const acme = await tenantNamed('Acme Logistics');
    expect((await notesOf(acme.id)).map((n) => n.kind)).toEqual([
      TenantNoteKind.note,
      TenantNoteKind.note,
    ]);

    const login = await as(app, null).post('/api/auth/login', {
      body: { email: RHEIN_ADMIN.email, password: DEMO_PASSWORD },
    });
    expect(login.status).toBe(200);
    const sessionToken = /rf_session=([^;]+)/.exec(login.headers.get('set-cookie') ?? '')?.[1];
    const res = await app.request(`/api/t/${rhein.id}/context`, {
      headers: { Cookie: `rf_session=${sessionToken}` },
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      ErrorCode.tenant_suspended,
    );
  });

  it('skips the Nordhafen activity without error when the signups seed did not run', async () => {
    const lines: string[] = [];
    const rollback = new Error('rollback');
    await expect(
      ownerDb().transaction(async (tx) => {
        const ctx: SeedContext = { db: tx, log: (line) => lines.push(line) };
        await seedCore(ctx);
        await tx
          .update(org)
          .set({ name: `${NORDHAFEN} (hidden)` })
          .where(and(eq(org.kind, OrgKind.tenant), eq(org.name, NORDHAFEN)));
        await seed(ctx);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(lines).toContain(
      `${NORDHAFEN} is missing; skipped its last activity (the signups seed creates it)`,
    );
  });
});
