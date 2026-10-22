import { Permission, UiPref } from '@rampflow/shared/values';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/page';
import { Skeleton } from '@/components/ui/skeleton';
import { TableCell } from '@/components/ui/table';
import { guard } from '@/lib/access';
import {
  groupByModule,
  ModuleGroupTable,
  ToggleAllGroups,
  useModuleGroups,
} from '@/modules/core/entitlement-groups';
import { useEntitlementValue } from '@/modules/core/entitlements';
import { packagesQuery } from '@/modules/core/queries';

// PL-02: the three packages side by side, read-only. Per-tenant changes are overrides.

export const Route = createFileRoute('/platform/packages/')({
  beforeLoad: guard({ permission: Permission.core.manage_tenants }),
  component: PackagesPage,
});

function PackagesPage() {
  const { t } = useTranslation();
  const packages = useQuery(packagesQuery);
  const valueText = useEntitlementValue();
  const items = packages.data?.items ?? [];
  // A package lists only the keys it grants; one row per key across all packages.
  const groups = groupByModule([
    ...new Map(items.flatMap((p) => p.values).map((v) => [v.key, v] as const)).values(),
  ]);
  const state = useModuleGroups(
    UiPref.platform_packages_open_modules,
    groups.map((g) => g.module),
  );
  const valueIn = (p: (typeof items)[number], key: string) =>
    p.values.find((v) => v.key === key)?.value ?? false;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.platform.packages.title)}
        description={t(($) => $.platform.packages.description)}
      />
      {packages.data ? (
        <div className="flex max-w-5xl flex-col gap-2">
          <div className="flex justify-end">
            <ToggleAllGroups state={state} />
          </div>
          <div className="overflow-auto rounded-lg border bg-background">
            <ModuleGroupTable
              groups={groups}
              state={state}
              label={{ header: t(($) => $.platform.columns.entitlement) }}
              columns={items.map((p) => ({
                id: p.id,
                header: t(($) => $.platform.packages[p.id]),
                isOn: (row) => valueIn(p, row.key) === true,
              }))}
              renderCells={(row) =>
                items.map((p) => {
                  const value = valueIn(p, row.key);
                  return (
                    <TableCell key={p.id} className="tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {value === true ? (
                          <CheckIcon className="size-4 text-tone-success" aria-hidden />
                        ) : value === false ? (
                          <MinusIcon className="size-4 text-muted-foreground" aria-hidden />
                        ) : null}
                        {valueText(value)}
                        {row.soft ? (
                          <span className="text-xs text-muted-foreground">
                            {t(($) => $.platform.soft)}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                  );
                })
              }
            />
          </div>
        </div>
      ) : (
        <Skeleton className="h-96 max-w-5xl" />
      )}
    </div>
  );
}
