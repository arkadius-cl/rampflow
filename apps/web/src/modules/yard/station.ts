import type { ContextSite } from '@rampflow/shared/modules/core/api.context';
import { OrgKind } from '@rampflow/shared/values';
import { useRouteContext, useSearch } from '@tanstack/react-router';
import type { AreaRouteContext } from '@/lib/access';

/**
 * The station's site from `?site=`. The station shell writes it (last site of this device, else
 * the first allowed one), so a screen renders nothing until it is there.
 */
export function useStationSite(): ContextSite | undefined {
  const { access } = useRouteContext({ strict: false }) as Partial<AreaRouteContext>;
  const { site } = useSearch({ strict: false }) as { site?: string };
  if (access?.area !== OrgKind.tenant) return undefined;
  return access.context.sites.find((s) => s.id === site);
}

export const stationSearch = (search: Record<string, unknown>) => ({
  site: typeof search.site === 'string' ? search.site : undefined,
});
