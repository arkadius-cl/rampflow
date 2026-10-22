import { randomUUID } from 'node:crypto';
import {
  EuCountry,
  Salutation,
  TaxIdStatus,
  TaxIdType,
  TenantNoteKind,
} from '@rampflow/shared/modules/core/values';
import { OrgKind, PackageId, Role, StaffLocale, TokenPurpose } from '@rampflow/shared/values';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { InvitationId, TenantId, UserId } from '../../src/db/ids.ts';
import { env } from '../../src/kernel/env.ts';
import { deriveToken, tokenHashFor } from '../../src/kernel/tokens.ts';
import {
  appUser,
  invitation,
  membership,
  org,
  tenantNote,
  tenantSubscription,
} from '../../src/modules/core/schema.ts';
import { INVITATION_TTL_MS } from '../../src/modules/core/staff/invitations.ts';
import { findOrg, type SeedContext } from './context.ts';
import { ACME, type DemoAccount, ensureUser } from './core.ts';
import { NORDHAFEN, SIGNUP_TENANTS } from './signups.ts';

// The platform demo data of 04 (design "Seed data"): a suspended tenant, a tenant whose admin
// has not accepted the invitation yet, notes, and varied last activity. Times are relative to
// the run, so each run resets them.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const RHEIN = 'Rhein Lager GmbH';
export const ELBE_COLD = 'Elbe Cold Store GmbH';
export const ELBE_COLD_ADMIN = 'ops@elbe-cold.local';
const PLATFORM_ADMIN = 'admin@rampflow.local';

export const RHEIN_ADMIN: DemoAccount = {
  email: 'admin@rhein-lager.local',
  name: 'Mara Engel',
  locale: StaffLocale.de,
  parts: { givenName: 'Mara', familyName: 'Engel', salutation: Salutation.ms },
};

interface SeedNote {
  kind: TenantNoteKind;
  body: string;
  daysAgo: number;
}

export const NOTES: Readonly<Record<string, readonly SeedNote[]>> = {
  [RHEIN]: [
    {
      kind: TenantNoteKind.note,
      body: 'Several carriers reported bookings nobody delivered.',
      daysAgo: 5,
    },
    {
      kind: TenantNoteKind.suspended,
      body: 'Fake bookings reported by carriers; paused until the operator confirms its sites.',
      daysAgo: 3,
    },
  ],
  [ACME]: [
    { kind: TenantNoteKind.note, body: 'Pilot started with Lager Hamburg.', daysAgo: 30 },
    { kind: TenantNoteKind.note, body: 'Moved to Pro after the pilot.', daysAgo: 7 },
  ],
};

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms);

async function ensureTenantOrg(
  ctx: SeedContext,
  name: string,
  facts: Partial<typeof org.$inferInsert>,
  pkg: PackageId,
  updatedBy: UserId,
): Promise<TenantId> {
  let id = (await findOrg(ctx.db, OrgKind.tenant, name)) as TenantId | null;
  if (id) {
    await ctx.db.update(org).set(facts).where(eq(org.id, id));
  } else {
    const [row] = await ctx.db
      .insert(org)
      .values({ kind: OrgKind.tenant, name, ...facts })
      .returning({ id: org.id });
    id = row?.id as TenantId;
    ctx.log(`created tenant ${name}`);
  }
  await ctx.db
    .insert(tenantSubscription)
    .values({ tenantId: id, package: pkg, updatedBy })
    .onConflictDoNothing();
  return id;
}

/** One note per (tenant, kind, body); a rerun moves its time instead of adding a second. */
async function ensureNote(
  ctx: SeedContext,
  tenantId: TenantId,
  note: SeedNote,
  authorId: UserId,
  now: Date,
): Promise<void> {
  const createdAt = ago(now, note.daysAgo * DAY_MS);
  const [found] = await ctx.db
    .update(tenantNote)
    .set({ createdAt, authorId })
    .where(
      and(
        eq(tenantNote.tenantId, tenantId),
        eq(tenantNote.kind, note.kind),
        eq(tenantNote.body, note.body),
      ),
    )
    .returning({ id: tenantNote.id });
  if (!found) {
    await ctx.db
      .insert(tenantNote)
      .values({ tenantId, kind: note.kind, body: note.body, authorId, createdAt });
  }
}

/** The open `tenant_admin` invitation, renewed on each run so it never expires in dev. */
async function ensureAdminInvitation(
  ctx: SeedContext,
  tenantId: TenantId,
  email: string,
  invitedBy: UserId,
  now: Date,
): Promise<InvitationId> {
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  const [found] = await ctx.db
    .update(invitation)
    .set({ expiresAt })
    .where(
      and(
        eq(invitation.orgId, tenantId),
        eq(invitation.email, email),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
      ),
    )
    .returning({ id: invitation.id });
  if (found) return found.id;
  const id = randomUUID() as InvitationId;
  await ctx.db.insert(invitation).values({
    id,
    orgId: tenantId,
    orgKind: OrgKind.tenant,
    email,
    role: Role.tenant_admin,
    tokenHash: tokenHashFor(TokenPurpose.invitation, id),
    invitedBy,
    expiresAt,
  });
  ctx.log(`invited ${email} to ${ELBE_COLD}`);
  return id;
}

async function userId(ctx: SeedContext, email: string): Promise<UserId | null> {
  const [row] = await ctx.db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email));
  return row?.id ?? null;
}

export async function seed(ctx: SeedContext): Promise<void> {
  const now = new Date();
  const platformAdmin = await userId(ctx, PLATFORM_ADMIN);
  if (!platformAdmin) throw new Error(`${PLATFORM_ADMIN} is missing; run the core seed first`);

  const activatedAt = ago(now, 60 * DAY_MS);
  const rhein = await ensureTenantOrg(
    ctx,
    RHEIN,
    {
      country: EuCountry.DE,
      taxIdType: TaxIdType.eu_vat,
      taxIdValue: 'DE811569869',
      taxIdStatus: TaxIdStatus.verified,
      taxIdCheckedAt: activatedAt,
      activatedAt,
      suspendedAt: ago(now, 3 * DAY_MS),
    },
    PackageId.start,
    platformAdmin,
  );
  const rheinAdmin = await ensureUser(ctx, RHEIN_ADMIN);
  await ctx.db
    .update(appUser)
    .set({ lastSeenAt: ago(now, 40 * DAY_MS) })
    .where(eq(appUser.id, rheinAdmin));
  await ctx.db
    .insert(membership)
    .values({ userId: rheinAdmin, orgId: rhein, orgKind: OrgKind.tenant, role: Role.tenant_admin })
    .onConflictDoNothing();

  const elbe = await ensureTenantOrg(
    ctx,
    ELBE_COLD,
    { country: null },
    PackageId.pro,
    platformAdmin,
  );
  const invitationId = await ensureAdminInvitation(ctx, elbe, ELBE_COLD_ADMIN, platformAdmin, now);
  ctx.log(
    `invitation link of ${ELBE_COLD_ADMIN}: ${env.APP_ORIGIN}/invite#${deriveToken(TokenPurpose.invitation, invitationId)}`,
  );

  for (const [name, notes] of Object.entries(NOTES)) {
    const tenantId = (await findOrg(ctx.db, OrgKind.tenant, name)) as TenantId | null;
    if (!tenantId) {
      ctx.log(`${name} is missing; skipped its notes`);
      continue;
    }
    for (const note of notes) await ensureNote(ctx, tenantId, note, platformAdmin, now);
  }

  const acme = await findOrg(ctx.db, OrgKind.tenant, ACME);
  if (acme) {
    const members = await ctx.db
      .select({ id: membership.userId })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(eq(membership.orgId, acme))
      .orderBy(asc(appUser.email));
    // 10 to 90 minutes ago, spread over the members, so the activity sort shows an order.
    const step = members.length > 1 ? 80 / (members.length - 1) : 0;
    for (const [i, m] of members.entries()) {
      const lastSeenAt = ago(now, Math.round(10 + i * step) * MINUTE_MS);
      await ctx.db.update(appUser).set({ lastSeenAt }).where(eq(appUser.id, m.id));
    }
  }

  const nordhafen = SIGNUP_TENANTS.find((t) => t.name === NORDHAFEN);
  if (!nordhafen || !(await findOrg(ctx.db, OrgKind.tenant, NORDHAFEN))) {
    ctx.log(`${NORDHAFEN} is missing; skipped its last activity (the signups seed creates it)`);
    return;
  }
  await ctx.db
    .update(appUser)
    .set({ lastSeenAt: ago(now, 2 * DAY_MS) })
    .where(eq(appUser.email, nordhafen.admin.email));
}
