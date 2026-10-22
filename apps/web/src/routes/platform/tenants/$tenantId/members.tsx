import {
  PlatformMemberListQuery,
  type PlatformMemberView,
} from '@rampflow/shared/modules/core/api.platform';
import {
  PlatformMemberKind,
  PlatformMemberSortKey,
  PlatformMemberState,
} from '@rampflow/shared/modules/core/values';
import { BadgeSize, TenantRole, values } from '@rampflow/shared/values';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type dataTableFeatures } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { canonicalSearch, useListState } from '@/components/data-table/use-list-state';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { useFormat } from '@/modules/core/format';
import { tenantMembersQuery } from '@/modules/core/queries';
import { RelativeTime } from '@/modules/core/relative-time';
import { MemberStateBadge } from '@/modules/core/tenant-status';

// PL-06: the Members tab, an Objektliste of members and open invitations. Read-only: the
// platform manages neither, so rows link nowhere and have no actions (ADR-0015).

export const Route = createFileRoute('/platform/tenants/$tenantId/members')({
  validateSearch: PlatformMemberListQuery.search,
  search: { middlewares: [canonicalSearch(PlatformMemberListQuery)] },
  component: MembersTab,
});

const column = createColumnHelper<typeof dataTableFeatures, PlatformMemberView>();

function useColumns() {
  const { t } = useTranslation();
  const format = useFormat();
  return useMemo(
    () =>
      column.columns([
        column.accessor(PlatformMemberSortKey.name, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.members.name)} />
          ),
          cell: ({ row }) =>
            row.original.name ? (
              <span className="font-medium">{row.original.name}</span>
            ) : (
              <span className="text-muted-foreground">
                {t(($) => $.platform.member_state[row.original.state])}
              </span>
            ),
        }),
        column.accessor(PlatformMemberSortKey.email, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.members.email)} />
          ),
        }),
        column.accessor(PlatformMemberSortKey.role, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.members.role)} />
          ),
          cell: ({ row }) => t(($) => $.shell.roles[row.original.role]),
        }),
        column.display({
          id: 'state',
          header: () => t(($) => $.platform.members.state),
          cell: ({ row }) => <MemberStateBadge state={row.original.state} size={BadgeSize.sm} />,
        }),
        column.display({
          id: 'emailVerified',
          header: () => t(($) => $.platform.members.email_verified),
          cell: ({ row }) =>
            row.original.emailVerified ? (
              <span className="inline-flex items-center gap-1">
                <CheckIcon className="size-3.5" aria-hidden />
                {t(($) => $.platform.members.verified)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <MinusIcon className="size-3.5" aria-hidden />
                {t(($) => $.platform.members.unverified)}
              </span>
            ),
        }),
        column.accessor(PlatformMemberSortKey.lastActivityAt, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.members.last_activity)} />
          ),
          cell: ({ row }) => (
            <RelativeTime
              iso={row.original.lastActivityAt}
              empty={t(($) => $.platform.tenants.never)}
            />
          ),
        }),
        column.accessor(PlatformMemberSortKey.since, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.members.since)} />
          ),
          cell: ({ row }) => (
            <span className="whitespace-nowrap tabular-nums">
              {format.instant(row.original.since)}
              {row.original.kind === PlatformMemberKind.invitation ? (
                <span className="text-muted-foreground">
                  {', '}
                  {t(($) => $.platform.members.expires, {
                    at: format.instant(row.original.expiresAt),
                  })}
                </span>
              ) : null}
            </span>
          ),
        }),
      ]),
    [t, format],
  );
}

function MembersTab() {
  const { t } = useTranslation();
  const { tenantId } = Route.useParams();
  const navigate = Route.useNavigate();
  const controls = useListState(PlatformMemberListQuery, Route.useSearch(), (search, replace) =>
    navigate({ to: '.', search, replace }),
  );
  const members = useQuery(tenantMembersQuery(tenantId, controls.state));
  const columns = useColumns();
  return (
    <DataTable
      controls={controls}
      query={members}
      columns={columns}
      facets={{
        role: {
          title: t(($) => $.platform.members.role),
          options: values(TenantRole).map((role) => ({
            value: role,
            label: t(($) => $.shell.roles[role]),
          })),
        },
        state: {
          title: t(($) => $.platform.members.state),
          options: values(PlatformMemberState).map((state) => ({
            value: state,
            label: t(($) => $.platform.member_state[state]),
          })),
        },
      }}
      label={t(($) => $.platform.tenant.tabs.members)}
      searchPlaceholder={t(($) => $.platform.members.search)}
      getRowId={(row) => row.id}
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t(($) => $.platform.members.empty)}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      }
      noMatchTitle={t(($) => $.platform.members.no_match)}
    />
  );
}
