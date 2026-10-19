import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/office-shell';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { guard } from '@/lib/access';
import { useEntitlementLabel, useEntitlementValue } from '@/modules/core/entitlements';
import { packagesQuery } from '@/modules/core/queries';

// PL-02: the three packages side by side, read-only. Per-tenant changes are overrides.

export const Route = createFileRoute('/platform/packages/')({
  beforeLoad: guard({ permission: 'core.manage_tenants' }),
  component: PackagesPage,
});

function PackagesPage() {
  const { t } = useTranslation();
  const packages = useQuery(packagesQuery);
  const label = useEntitlementLabel();
  const valueText = useEntitlementValue();
  const items = packages.data?.items ?? [];
  // A package lists only the keys it grants; the longest list first keeps the catalog order.
  const rows = [
    ...new Map(
      items
        .toSorted((a, b) => b.values.length - a.values.length)
        .flatMap((p) => p.values)
        .map((v) => [v.key, v] as const),
    ).values(),
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.platform.packages.title)}
        description={t(($) => $.platform.packages.description)}
      />
      {packages.data ? (
        <div className="max-w-4xl overflow-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.platform.columns.entitlement)}</TableHead>
                {items.map((p) => (
                  <TableHead key={p.id}>{t(($) => $.platform.packages[p.id])}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="font-medium">{label(row.key)}</div>
                    <code className="text-xs text-muted-foreground">{row.key}</code>
                  </TableCell>
                  {items.map((p) => {
                    const value = p.values.find((v) => v.key === row.key)?.value ?? false;
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
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Skeleton className="h-96 max-w-4xl" />
      )}
    </div>
  );
}
