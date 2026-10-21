import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../../apps/api/src/modules/core/auth/password.ts';
import { PackageId } from '../../packages/shared/src/values/packages.ts';
import { OrgKind, TenantRole } from '../../packages/shared/src/values/roles.ts';

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

/** Marks a tenant active since its creation, as the 02 backfill does for older tenants. */
export async function activateTenant(tenantId: string): Promise<void> {
  await db().query("update org set activated_at = created_at where id = $1 and kind = 'tenant'", [
    tenantId,
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

/** Gives a tenant a tax id, as a self-registered tenant has one (RG-04). */
export async function setTaxId(tenantId: string, type: string, value: string): Promise<void> {
  await db().query(
    `update org set tax_id_type = $2, tax_id_value = $3, tax_id_status = 'unverified'
     where id = $1 and kind = 'tenant'`,
    [tenantId, type, value],
  );
}

/** The registration rows of an email, newest first (RG-01 to RG-05). */
export async function signupsOf(email: string) {
  const { rows } = await db().query<{
    status: string;
    tax_id_value: string;
    tenant_id: string | null;
  }>(
    'select status, tax_id_value, tenant_id from tenant_signup where email = $1 order by created_at desc',
    [email],
  );
  return rows;
}

/** What exists under a registration's email and company name, for "nothing before the click". */
export async function accountAndTenant(email: string, companyName: string) {
  const { rows } = await db().query<{ users: number; orgs: number }>(
    `select (select count(*)::int from app_user where email = $1) as users,
            (select count(*)::int from org where name = $2) as orgs`,
    [email, companyName],
  );
  return rows[0] as { users: number; orgs: number };
}

/** The flags RG-04 reads that no API exposes yet (the platform screens show them in 04). */
export async function tenantFacts(tenantId: string) {
  const { rows } = await db().query<{
    possible_duplicate: boolean;
    activated_at: Date | null;
    tax_id_value: string | null;
  }>('select possible_duplicate, activated_at, tax_id_value from org where id = $1', [tenantId]);
  return rows[0];
}

export interface PasswordUser {
  id: string;
  email: string;
  password: string;
}

export interface OnboardingTenant {
  tenantId: string;
  users: Record<TenantRole, PasswordUser>;
}

/**
 * A tenant in onboarding (ON-01 to ON-03), as a platform admin or a self-registration leaves it:
 * on Pro, no site, hall or dock, `activated_at` null, with one user per tenant role.
 */
export async function createOnboardingTenant(): Promise<OnboardingTenant> {
  const { rows } = await db().query<{ id: string }>(
    'insert into org (kind, name) values ($1, $2) returning id',
    [OrgKind.tenant, `Onboarding ${randomBytes(3).toString('hex')}`],
  );
  const tenantId = rows[0]?.id as string;
  const users = {} as Record<TenantRole, PasswordUser>;
  for (const role of Object.values(TenantRole)) {
    const account = await createAccount(uniqueEmail(role), 'onboarding-e2e-pass', `E2E ${role}`);
    await addMembership(account.id, tenantId, OrgKind.tenant, role);
    users[role] = account;
  }
  await db().query(
    'insert into tenant_subscription (tenant_id, package, updated_by) values ($1, $2, $3)',
    [tenantId, PackageId.pro, users.tenant_admin.id],
  );
  return { tenantId, users };
}
