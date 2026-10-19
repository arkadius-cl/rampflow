import type { SiteUsage, SiteView } from '@rampflow/shared/modules/core/api.sites';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, MapPinIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';
import { tenantContextQuery } from '@/lib/access';
import { cn } from '@/lib/utils';

// MD-01: the site list with usage against the package limits `core.max_sites` and
// `core.max_docks` (null: no limit).

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {limit === null
            ? t(($) => $.sites.usage.unlimited, { used })
            : t(($) => $.sites.usage.of, { used, limit })}
        </span>
      </div>
      {limit === null ? null : (
        <Progress
          value={Math.min(100, (used / Math.max(limit, 1)) * 100)}
          className="mt-1.5"
          aria-label={label}
        />
      )}
    </div>
  );
}

export function UsageMeters({
  orgId,
  usage,
  className,
}: {
  orgId: string;
  usage: SiteUsage;
  className?: string;
}) {
  const { t } = useTranslation();
  const limits = useQuery(tenantContextQuery(orgId)).data?.entitlements.limits;
  return (
    <div
      className={cn('flex flex-col gap-3 rounded-lg border bg-background p-3 text-xs', className)}
    >
      <Meter
        label={t(($) => $.sites.usage.sites)}
        used={usage.sites}
        limit={limits?.['core.max_sites'] ?? null}
      />
      <Meter
        label={t(($) => $.sites.usage.docks)}
        used={usage.docks}
        limit={limits?.['core.max_docks'] ?? null}
      />
      <p className="text-muted-foreground">{t(($) => $.sites.usage.docks_hint)}</p>
    </div>
  );
}

/** The left pane of a site page: every site of the org, the current one marked. */
export function SiteNav({
  orgId,
  sites,
  usage,
  currentId,
}: {
  orgId: string;
  sites: SiteView[];
  usage: SiteUsage;
  currentId: string;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t(($) => $.sites.nav_label)} className="flex flex-col gap-2">
      {sites.map((s) => (
        <Link
          key={s.id}
          to="/t/$orgId/sites/$siteId"
          params={{ orgId, siteId: s.id }}
          aria-current={s.id === currentId ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted',
            s.id === currentId && 'border-primary ring-1 ring-primary',
          )}
        >
          <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className={cn('truncate font-medium', !s.active && 'text-muted-foreground')}>
              {s.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {s.active ? s.timeZone : t(($) => $.sites.status.inactive)}
            </div>
          </div>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Link>
      ))}
      <UsageMeters orgId={orgId} usage={usage} className="mt-2" />
    </nav>
  );
}
