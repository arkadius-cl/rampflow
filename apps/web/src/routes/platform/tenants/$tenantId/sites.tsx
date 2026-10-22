import {
  PlatformSiteListQuery,
  type PlatformSiteView,
} from '@rampflow/shared/modules/core/api.platform';
import { PlatformSiteSortKey } from '@rampflow/shared/modules/core/values';
import { BadgeTone, UiSize, values, YesNo } from '@rampflow/shared/values';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { CircleCheckIcon, CircleMinusIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type dataTableFeatures } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { canonicalSearch, useListState } from '@/components/data-table/use-list-state';
import { StatusBadge } from '@/components/status-badge';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { useCountryName } from '@/modules/carriers/format';
import { useFormat } from '@/modules/core/format';
import { tenantSitesQuery } from '@/modules/core/queries';

// PL-06: the Sites tab, an Objektliste of master data only. Read-only: a site's view belongs to
// the tenant area, so rows link nowhere and have no actions (ADR-0015).

export const Route = createFileRoute('/platform/tenants/$tenantId/sites')({
  validateSearch: PlatformSiteListQuery.search,
  search: { middlewares: [canonicalSearch(PlatformSiteListQuery)] },
  component: SitesTab,
});

const column = createColumnHelper<typeof dataTableFeatures, PlatformSiteView>();

function useColumns() {
  const { t } = useTranslation();
  const format = useFormat();
  const countryName = useCountryName();
  return useMemo(
    () =>
      column.columns([
        column.accessor(PlatformSiteSortKey.name, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.sites.name)} />
          ),
          cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        }),
        column.accessor(PlatformSiteSortKey.city, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.sites.city)} />
          ),
        }),
        column.display({
          id: 'country',
          header: () => t(($) => $.platform.sites.country),
          cell: ({ row }) => (
            <span>
              <span className="font-mono">{row.original.country}</span>{' '}
              <span className="text-muted-foreground">{countryName(row.original.country)}</span>
            </span>
          ),
        }),
        column.display({
          id: 'timeZone',
          header: () => t(($) => $.platform.sites.time_zone),
          cell: ({ row }) => row.original.timeZone,
        }),
        column.display({
          id: 'active',
          header: () => t(($) => $.platform.sites.active),
          cell: ({ row }) => (
            <StatusBadge
              size={UiSize.sm}
              meta={
                row.original.active
                  ? {
                      icon: CircleCheckIcon,
                      tone: BadgeTone.success,
                      label: t(($) => $.platform.sites.active),
                    }
                  : {
                      icon: CircleMinusIcon,
                      tone: BadgeTone.neutral,
                      label: t(($) => $.platform.sites.inactive),
                    }
              }
            />
          ),
        }),
        column.display({
          id: 'halls',
          header: () => (
            <span className="block text-right">{t(($) => $.platform.sites.halls)}</span>
          ),
          cell: ({ row }) => (
            <span className="block text-right tabular-nums">
              {format.number(row.original.halls)}
            </span>
          ),
        }),
        column.display({
          id: 'docks',
          header: () => (
            <span className="block text-right">{t(($) => $.platform.sites.docks)}</span>
          ),
          cell: ({ row }) => (
            <span className="block text-right tabular-nums">
              {format.number(row.original.docks)}
            </span>
          ),
        }),
        column.accessor(PlatformSiteSortKey.createdAt, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.tenants.created_at)} />
          ),
          cell: ({ row }) => (
            <span className="whitespace-nowrap tabular-nums">
              {format.instant(row.original.createdAt)}
            </span>
          ),
        }),
      ]),
    [t, format, countryName],
  );
}

function SitesTab() {
  const { t } = useTranslation();
  const { tenantId } = Route.useParams();
  const navigate = Route.useNavigate();
  const controls = useListState(PlatformSiteListQuery, Route.useSearch(), (search, replace) =>
    navigate({ to: '.', search, replace }),
  );
  const sites = useQuery(tenantSitesQuery(tenantId, controls.state));
  const columns = useColumns();
  return (
    <DataTable
      controls={controls}
      query={sites}
      columns={columns}
      facets={{
        active: {
          title: t(($) => $.platform.sites.active),
          options: values(YesNo).map((value) => ({
            value,
            label:
              value === YesNo.yes
                ? t(($) => $.platform.sites.active)
                : t(($) => $.platform.sites.inactive),
          })),
        },
      }}
      label={t(($) => $.platform.tenant.tabs.sites)}
      searchPlaceholder={t(($) => $.platform.sites.search)}
      getRowId={(row) => row.id}
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t(($) => $.platform.sites.empty)}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      }
      noMatchTitle={t(($) => $.platform.sites.no_match)}
    />
  );
}
