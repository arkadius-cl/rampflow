import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../../apps/api/src/modules/core/auth/password.ts';
import type { OrgKind } from '../../packages/shared/src/values/roles.ts';

// Direct fixtures as the owner role (MIGRATION_DATABASE_URL), past RLS, for what no U2 screen
// creates yet: passwords on seeded users, invitations (U3 creates them through its screens).

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

export const uniqueEmail = (label: string) => `${label}-${randomBytes(4).toString('hex')}@e2e.test`;

/** Sets a password on an existing user, as if they had chosen it. */
export async function setPassword(userId: string, password: string): Promise<void> {
  await db().query('update app_user set password_hash = $1 where id = $2', [
    await hashPassword(password),
    userId,
  ]);
}

export async function addMembership(
  userId: string,
  orgId: string,
  orgKind: OrgKind,
  role: string,
): Promise<void> {
  await db().query(
    'insert into membership (user_id, org_id, org_kind, role) values ($1, $2, $3, $4)',
    [userId, orgId, orgKind, role],
  );
}

/** A verified account without memberships. */
export async function createAccount(email: string, password: string, name = 'E2E User') {
  const { rows } = await db().query<{ id: string }>(
    `insert into app_user (email, name, locale, password_hash, email_verified_at)
     values ($1, $2, 'en', $3, now()) returning id`,
    [email, name, await hashPassword(password)],
  );
  return { id: rows[0]?.id as string, email, password };
}

/** A pending invitation; returns the raw token of its /invite#<token> link. */
export async function createInvitation(o: {
  orgId: string;
  orgKind: 'tenant' | 'carrier';
  role: string;
  email: string;
  invitedBy: string;
  siteIds?: string[];
}): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db().query(
    `insert into invitation (org_id, org_kind, email, role, site_ids, token_hash, invited_by, expires_at)
     values ($1, $2, $3, $4, $5::uuid[], $6, $7, now() + interval '7 days')`,
    [
      o.orgId,
      o.orgKind,
      o.email,
      o.role,
      o.siteIds ?? [],
      createHash('sha256').update(token).digest(),
      o.invitedBy,
    ],
  );
  return token;
}

export async function sitesOfMember(email: string): Promise<string[]> {
  const { rows } = await db().query<{ site_id: string }>(
    `select ms.site_id from membership_site ms join app_user u on u.id = ms.user_id
     where u.email = $1`,
    [email],
  );
  return rows.map((r) => r.site_id);
}
