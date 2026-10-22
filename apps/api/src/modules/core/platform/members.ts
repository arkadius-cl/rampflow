import type { ListStateOf } from '@rampflow/shared/contract/list';
import type {
  PlatformMemberList,
  PlatformMemberListQuery,
  PlatformMemberView,
} from '@rampflow/shared/modules/core/api.platform';
import {
  PlatformMemberKind,
  PlatformMemberSortKey,
  PlatformMemberState,
} from '@rampflow/shared/modules/core/values';
import { TenantRole, values } from '@rampflow/shared/values';
import { and, inArray, isNotNull, type SQL, sql } from 'drizzle-orm';
import type { TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import {
  contains,
  facetCounts,
  inOrderOf,
  orderBy,
  pageOf,
  pageWindow,
} from '../../../kernel/list.ts';
import { appUser, invitation, membership } from '../schema.ts';
import { isPending } from '../staff/invitations.ts';

// PL-06: the tenant hub's Members tab. Members and open invitations are one `union all` under
// the platform party, which reads membership, app_user and invitation (design decision 5).

export type PlatformMemberListState = ListStateOf<typeof PlatformMemberListQuery>;

type MemberRow = {
  id: string;
  kind: PlatformMemberKind;
  user_id: string | null;
  name: string | null;
  email: string;
  role: TenantRole;
  state: PlatformMemberState;
  email_verified: boolean;
  /** Raw query results carry timestamps as Postgres text. */
  last_activity_at: string | null;
  since: string;
  expires_at: string | null;
};

const iso = (at: string) => new Date(at).toISOString();

/** The union's columns, by the names the outer query reads. */
const col = {
  id: sql`r.id`,
  name: sql`r.name`,
  email: sql`r.email`,
  role: sql`r.role`,
  state: sql`r.state`,
  lastActivityAt: sql`r.last_activity_at`,
  since: sql`r.since`,
};

/** Members (with their user) and open invitations, an expired one in state `expired`. */
function rowsOf(tenantId: TenantId, now: Date): SQL {
  const members = sql`select ${membership.id} as id, ${PlatformMemberKind.member}::text as kind, ${appUser.id} as user_id, ${appUser.name} as name, ${appUser.email}::text as email, ${membership.role} as role, case when ${isNotNull(appUser.disabledAt)} then ${PlatformMemberState.disabled} else ${PlatformMemberState.member} end::text as state, ${isNotNull(appUser.emailVerifiedAt)} as email_verified, ${appUser.lastSeenAt} as last_activity_at, ${membership.createdAt} as since, null::timestamptz as expires_at from ${membership} inner join ${appUser} on ${appUser.id} = ${membership.userId} where ${membership.orgId} = ${tenantId}`;
  const invitations = sql`select ${invitation.id}, ${PlatformMemberKind.invitation}::text, null::uuid, null::text, ${invitation.email}::text, ${invitation.role}, case when ${invitation.expiresAt} <= ${now} then ${PlatformMemberState.expired} else ${PlatformMemberState.invited} end::text, false, null::timestamptz, ${invitation.createdAt}, ${invitation.expiresAt} from ${invitation} where ${and(sql`${invitation.orgId} = ${tenantId}`, isPending)}`;
  return sql`(${members} union all ${invitations}) as r`;
}

function viewOf(r: MemberRow): PlatformMemberView {
  const base = { id: r.id, email: r.email, role: r.role, since: iso(r.since) };
  if (r.kind === PlatformMemberKind.invitation) {
    return {
      ...base,
      kind: PlatformMemberKind.invitation,
      name: null,
      state:
        r.state === PlatformMemberState.expired
          ? PlatformMemberState.expired
          : PlatformMemberState.invited,
      emailVerified: false,
      lastActivityAt: null,
      expiresAt: iso(r.expires_at as string),
    };
  }
  return {
    ...base,
    kind: PlatformMemberKind.member,
    userId: r.user_id as string,
    name: r.name as string,
    state:
      r.state === PlatformMemberState.disabled
        ? PlatformMemberState.disabled
        : PlatformMemberState.member,
    emailVerified: r.email_verified,
    lastActivityAt: r.last_activity_at === null ? null : iso(r.last_activity_at),
  };
}

/** One page of a tenant's members and open invitations, with the role and state counts. */
export async function memberList(
  tx: Tx,
  tenantId: TenantId,
  state: PlatformMemberListState,
  now: Date,
): Promise<PlatformMemberList> {
  const from = rowsOf(tenantId, now);
  const searched = contains(state.q, col.name, col.email);
  const role = state.role.length > 0 ? inArray(col.role, state.role) : undefined;
  const memberState = state.state.length > 0 ? inArray(col.state, state.state) : undefined;
  const where = (...parts: (SQL | undefined)[]) => and(...parts) ?? sql`true`;
  const grouped = async (column: SQL, filter: SQL) => {
    const { rows } = await tx.execute<{ value: string; count: number }>(
      sql`select ${column} as value, count(*)::int as count from ${from} where ${filter} group by 1`,
    );
    return rows;
  };
  const byRole = await grouped(col.role, where(searched, memberState));
  const byState = await grouped(col.state, where(searched, role));
  const total = byState
    .filter((r) => state.state.length === 0 || state.state.includes(r.value as PlatformMemberState))
    .reduce((n, r) => n + r.count, 0);
  const { limit, offset } = pageWindow(state);
  const order = orderBy(
    state,
    {
      name: col.name,
      email: col.email,
      role: inOrderOf(values(TenantRole), col.role),
      lastActivityAt: col.lastActivityAt,
      since: col.since,
    },
    col.id,
    { nullsLast: [PlatformMemberSortKey.name, PlatformMemberSortKey.lastActivityAt] },
  );
  const { rows } = await tx.execute<MemberRow>(
    sql`select * from ${from} where ${where(searched, role, memberState)} order by ${sql.join(order, sql`, `)} limit ${limit} offset ${offset}`,
  );
  return {
    ...pageOf(state, total, rows.map(viewOf)),
    facets: {
      role: facetCounts(values(TenantRole), byRole as { value: TenantRole; count: number }[]),
      state: facetCounts(
        values(PlatformMemberState),
        byState as { value: PlatformMemberState; count: number }[],
      ),
    },
  };
}
