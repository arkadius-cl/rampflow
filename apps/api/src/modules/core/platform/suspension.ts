import { TenantNoteKind } from '@rampflow/shared/modules/core/values';
import { EmailTemplate, OrgKind, Role } from '@rampflow/shared/values';
import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import type { GreetingNames } from '../emails/greeting.ts';
import { appUser, membership, org } from '../schema.ts';
import { insertNote, requireTenantOrg } from './notes.ts';

// Suspending and reactivating a tenant (PL-07, design decision 7). The state is org.suspended_at;
// the reason is the body of the note, which only the platform reads.

type SuspensionKind = typeof TenantNoteKind.suspended | typeof TenantNoteKind.reactivated;

interface SuspensionCommand {
  /** The value suspended_at takes. */
  suspendedAt: (now: Date) => Date | null;
  /** Matches only a tenant the command changes, so a repeat or a concurrent twin is a no-op. */
  applies: SQL;
}

const COMMANDS: Record<SuspensionKind, SuspensionCommand> = {
  [TenantNoteKind.suspended]: { suspendedAt: (now) => now, applies: isNull(org.suspendedAt) },
  [TenantNoteKind.reactivated]: { suspendedAt: () => null, applies: isNotNull(org.suspendedAt) },
};

export interface SuspensionInput {
  reason: string;
  userId: UserId;
  /** The language of admins without a locale of their own: the platform default. */
  locale: string;
}

/** A PL-01 invitee has only a display name; it stands in for the given name. */
const recipientOf = (u: {
  name: string;
  givenName: string | null;
  familyName: string | null;
  salutation: GreetingNames['salutation'];
}): GreetingNames =>
  u.givenName && u.familyName
    ? { salutation: u.salutation, givenName: u.givenName, familyName: u.familyName }
    : { salutation: null, givenName: u.name, familyName: '' };

async function applySuspension(
  tx: Tx,
  kind: SuspensionKind,
  tenantId: TenantId,
  input: SuspensionInput,
  now: Date,
): Promise<void> {
  const command = COMMANDS[kind];
  const [changed] = await tx
    .update(org)
    .set({ suspendedAt: command.suspendedAt(now) })
    .where(and(eq(org.id, tenantId), eq(org.kind, OrgKind.tenant), command.applies))
    .returning({ name: org.name });
  if (!changed) {
    await requireTenantOrg(tx, tenantId);
    return;
  }
  const note = await insertNote(
    tx,
    { tenantId, kind, body: input.reason, authorId: input.userId },
    now,
  );
  const admins = await tx
    .select({
      id: appUser.id,
      email: appUser.email,
      locale: appUser.locale,
      name: appUser.name,
      givenName: appUser.givenName,
      familyName: appUser.familyName,
      salutation: appUser.salutation,
    })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(
      and(
        eq(membership.orgId, tenantId),
        eq(membership.role, Role.tenant_admin),
        isNull(appUser.disabledAt),
      ),
    );
  for (const admin of admins) {
    const recipient = recipientOf(admin);
    const common = {
      to: admin.email,
      locale: admin.locale ?? input.locale,
      // The outbox accepts only the scope's own tenant; the platform enqueues tenant-less.
      tenantId: null,
      dedupeKey: `tenant-suspension:${note.id}:${admin.id}`,
    };
    if (kind === TenantNoteKind.suspended) {
      await enqueueEmail(
        tx,
        {
          ...common,
          template: EmailTemplate.core_tenant_suspended,
          payload: { orgName: changed.name, reason: input.reason, recipient },
        },
        null,
      );
    } else {
      await enqueueEmail(
        tx,
        {
          ...common,
          template: EmailTemplate.core_tenant_reactivated,
          payload: { orgName: changed.name, recipient },
        },
        null,
      );
    }
  }
}

/**
 * PL-07: stops the tenant's staff, carriers at it, drivers and public links from its next
 * request on (ADR-0018). Writes the `suspended` note and tells every admin who is not disabled.
 * A suspended tenant stays as it is; a non-tenant id answers 404.
 */
export const suspendTenant = (tx: Tx, tenantId: TenantId, input: SuspensionInput, now: Date) =>
  applySuspension(tx, TenantNoteKind.suspended, tenantId, input, now);

/** PL-07: the mirror of `suspendTenant`; a tenant that is not suspended stays as it is. */
export const reactivateTenant = (tx: Tx, tenantId: TenantId, input: SuspensionInput, now: Date) =>
  applySuspension(tx, TenantNoteKind.reactivated, tenantId, input, now);
