import {
  EmailTemplate,
  EnqueueResult,
  ScopeParty,
  Setting,
  SqlState,
  StaffLocale,
  TenantActorKind,
  values,
} from '@rampflow/shared/values';
import { and, eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { AnyOrgId } from '../../../db/ids.ts';
import { asScope, type Scope, type Tx } from '../../../db/scope.ts';
import { loadAccess } from '../../../kernel/access.ts';
import type { Clock } from '../../../kernel/clock.ts';
import { forEachTenant, type Job, type JobContext, type JobStats } from '../../../kernel/jobs.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import { platformSystemScope, systemScope } from '../../../kernel/system.ts';
// biome-ignore lint/style/noRestrictedImports: retention purges every table by its rule (data model, "Retention"), the auth tables included; it deletes rows and reads none of their values
import { appUser, authToken, membership, org, rateLimitEvent } from '../../core/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { applyTenantRetention, retentionLimits } from '../retention/rules.ts';

// PL-05: `pnpm retention:run` runs this once; deployment schedules it daily (ADR-0010). Every
// rule is a set-based statement on rows past their limit, so a second run changes nothing, and
// the job log holds counts only.

const JOB = 'retention';
const DAY_MS = 86_400_000;
const NOTICE_DAYS = 30;
const AUTH_ROWS_MS = DAY_MS;
const OUTBOX_DAYS = 7;

const isStaffLocale = (l: string | null): l is StaffLocale =>
  l !== null && (values(StaffLocale) as readonly string[]).includes(l);

/** A Postgres foreign-key violation: a row elsewhere still references this one. */
const isReferenced = (e: unknown): boolean => {
  for (let cur = e; cur && typeof cur === 'object'; cur = (cur as { cause?: unknown }).cause) {
    if ('code' in cur && cur.code === SqlState.foreign_key_violation) return true;
  }
  return false;
};

/**
 * Carrier users without a sign-in for `privacy.retention.carrier_inactive_days` (rampflow is
 * their controller): a notice 30 days ahead, then deletion with the carrier orgs left empty.
 * A user that bookings or audit rows still reference is anonymized and disabled instead.
 */
async function inactiveCarrierUsers(tx: Tx, clock: Clock): Promise<JobStats> {
  const now = clock.now();
  const { value: days } = await asScope(tx, systemScope(JOB), async (s) =>
    (await loadAccess(s, systemScope(JOB), clock)).setting(
      Setting.privacy.retention.carrier_inactive_days,
      null,
    ),
  );
  return asScope(tx, platformSystemScope, async () => {
    const lastActive = sql<Date>`coalesce(${appUser.lastSeenAt}, ${appUser.createdAt})`;
    const carrierOnly = and(
      sql`exists (select 1 from ${membership} m where m.user_id = ${appUser.id} and m.org_kind = 'carrier')`,
      sql`not exists (select 1 from ${membership} m where m.user_id = ${appUser.id} and m.org_kind <> 'carrier')`,
    );
    const users = await tx
      .select({
        id: appUser.id,
        email: appUser.email,
        locale: appUser.locale,
        disabledAt: appUser.disabledAt,
        lastActive,
      })
      .from(appUser)
      .where(
        and(carrierOnly, lt(lastActive, new Date(now.getTime() - (days - NOTICE_DAYS) * DAY_MS))),
      );

    const stats = {
      inactiveNotices: 0,
      usersDeleted: 0,
      usersAnonymized: 0,
      carrierOrgsDeleted: 0,
    };
    const emptied = new Set<AnyOrgId>();
    for (const u of users) {
      const deletesAt = new Date(new Date(u.lastActive).getTime() + days * DAY_MS);
      if (deletesAt > now) {
        if (u.disabledAt) continue;
        const sent = await enqueueEmail(
          tx,
          {
            template: EmailTemplate.privacy_inactive_notice,
            to: u.email,
            locale: isStaffLocale(u.locale) ? u.locale : 'en',
            tenantId: null,
            payload: {
              locale: isStaffLocale(u.locale) ? u.locale : StaffLocale.en,
              deletesOn: deletesAt.toISOString().slice(0, 10),
            },
            // A sign-in moves the deadline and so makes a new notice due.
            dedupeKey: `inactive-notice:${u.id}:${deletesAt.toISOString()}`,
          },
          null,
        );
        if (sent === EnqueueResult.enqueued) stats.inactiveNotices++;
        continue;
      }
      const orgs = await tx
        .select({ orgId: membership.orgId })
        .from(membership)
        .where(eq(membership.userId, u.id));
      for (const { orgId } of orgs) emptied.add(orgId);
      try {
        await tx.transaction((sp) => sp.delete(appUser).where(eq(appUser.id, u.id)));
        stats.usersDeleted++;
      } catch (e) {
        if (!isReferenced(e)) throw e;
        await tx.delete(membership).where(eq(membership.userId, u.id));
        await tx
          .update(appUser)
          .set({
            email: `deleted-${u.id}@invalid.rampflow`,
            name: '-',
            locale: null,
            uiPrefs: {},
            passwordHash: null,
            emailVerifiedAt: null,
            disabledAt: now,
          })
          .where(eq(appUser.id, u.id));
        stats.usersAnonymized++;
      }
    }
    for (const orgId of emptied) {
      const [member] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(eq(membership.orgId, orgId))
        .limit(1);
      if (member) continue;
      try {
        await tx.transaction((sp) =>
          sp.delete(org).where(and(eq(org.id, orgId), eq(org.kind, 'carrier'))),
        );
        stats.carrierOrgsDeleted++;
      } catch (e) {
        // A carrier with bookings or tenant links keeps its company record without members.
        if (!isReferenced(e)) throw e;
      }
    }
    return stats;
  });
}

/** Fixed limits: used or expired sign-in tokens and rate-limit events after 24 hours. */
async function authRows(tx: Tx, now: Date): Promise<JobStats> {
  const before = new Date(now.getTime() - AUTH_ROWS_MS);
  const tokens = await tx
    .delete(authToken)
    .where(
      or(
        and(isNotNull(authToken.usedAt), lt(authToken.usedAt, before)),
        lt(authToken.expiresAt, before),
      ),
    )
    .returning({ id: authToken.id });
  const events = await tx
    .delete(rateLimitEvent)
    .where(lt(rateLimitEvent.at, before))
    .returning({ id: rateLimitEvent.id });
  return { authTokensDeleted: tokens.length, rateLimitEventsDeleted: events.length };
}

/** Sent or failed outbox rows after 7 days; the worker emptied their payload when it sent. */
function outboxRows(tx: Tx, now: Date): Promise<JobStats> {
  const before = new Date(now.getTime() - OUTBOX_DAYS * DAY_MS);
  return asScope(tx, systemScope(JOB), async () => {
    const rows = await tx
      .delete(outboxMessage)
      .where(
        or(
          and(isNotNull(outboxMessage.sentAt), lt(outboxMessage.sentAt, before)),
          and(isNotNull(outboxMessage.failedAt), lt(outboxMessage.failedAt, before)),
        ),
      )
      .returning({ id: outboxMessage.id });
    return { outboxDeleted: rows.length };
  });
}

async function runRetention(ctx: JobContext): Promise<JobStats> {
  const now = ctx.clock.now();
  const tenants = await forEachTenant(ctx, JOB, async (tx, tenantId) => {
    const scope: Scope = {
      party: ScopeParty.tenant,
      tenantId,
      siteIds: 'all',
      actor: { kind: TenantActorKind.system, job: JOB },
    };
    const limits = await retentionLimits(await loadAccess(tx, scope, ctx.clock));
    return applyTenantRetention(tx, tenantId, limits, now);
  });
  return {
    ...tenants,
    ...(await inactiveCarrierUsers(ctx.tx, ctx.clock)),
    ...(await authRows(ctx.tx, now)),
    ...(await outboxRows(ctx.tx, now)),
  };
}

export const job: Job = { name: JOB, everySeconds: null, run: runRetention };
