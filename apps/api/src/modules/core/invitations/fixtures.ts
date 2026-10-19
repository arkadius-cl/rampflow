import { randomBytes, randomUUID } from 'node:crypto';
import type { Role } from '@rampflow/shared';
import type { OwnerDb } from '../../../../test/db.ts';
import {
  type AnyOrgId,
  hashToken,
  type InvitationId,
  type SiteId,
  type UserId,
} from '../../../db/ids.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { invitation, type OrgKind } from '../schema.ts';

// Pending invitations written as the owner, as U3's staff and carrier-user screens will create
// them. Returns the raw token of the /invite#<token> link.

export interface InvitationFixture {
  id: InvitationId;
  token: string;
  email: string;
}

export async function invitationFor(
  db: OwnerDb,
  o: {
    orgId: AnyOrgId;
    orgKind: OrgKind;
    role: Role;
    invitedBy: UserId | null;
    email?: string;
    siteIds?: readonly SiteId[];
    expiresAt?: Date;
  },
): Promise<InvitationFixture> {
  const id = randomUUID() as InvitationId;
  const token = deriveToken('invitation', id);
  const email = o.email ?? `invitee-${randomBytes(4).toString('hex')}@invite.test`;
  await db.insert(invitation).values({
    id,
    orgId: o.orgId,
    orgKind: o.orgKind,
    email,
    role: o.role,
    siteIds: [...(o.siteIds ?? [])],
    tokenHash: hashToken(token),
    invitedBy: o.invitedBy,
    expiresAt: o.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600_000),
  });
  return { id, token, email };
}
