import type { KpiReport, ReportFilter, VisitPage } from '@rampflow/shared/modules/report/api';
import { ReportExport } from '@rampflow/shared/modules/report/values';
import { OrgKind } from '@rampflow/shared/values';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api, call } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

// Queries of the reports screen (RP-01, RP-02). Keys: ['tenant', orgId, 'report', ...].

const PAGE_SIZE = 50;

export const reportKey = (orgId: string) =>
  [...queryKeys.org(OrgKind.tenant, orgId), 'report'] as const;

const reports = () => api.t[':orgId'].reports;

/** The query string of a filter; unset filters stay out. */
export function filterQuery(f: ReportFilter) {
  return {
    siteId: f.siteId,
    from: f.from,
    to: f.to,
    ...(f.resourceId ? { resourceId: f.resourceId } : {}),
    ...(f.carrierId ? { carrierId: f.carrierId } : {}),
  };
}

export const kpiQuery = (orgId: string, f: ReportFilter) =>
  queryOptions({
    queryKey: [...reportKey(orgId), 'kpis', f],
    queryFn: () =>
      call<KpiReport>(reports().kpis.$get({ param: { orgId }, query: filterQuery(f) })),
  });

export const visitsQuery = (orgId: string, f: ReportFilter) =>
  infiniteQueryOptions({
    queryKey: [...reportKey(orgId), 'visits', f],
    queryFn: ({ pageParam }) =>
      call<VisitPage>(
        reports().visits.$get({
          param: { orgId },
          query: {
            ...filterQuery(f),
            limit: String(PAGE_SIZE),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

/** Saves a response body as a file, named by its Content-Disposition. */
export async function saveDownload(res: Response, fallback: string): Promise<void> {
  if (!res.ok) await call(Promise.resolve(res));
  const name =
    /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallback;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadCsv(orgId: string, kind: ReportExport, f: ReportFilter) {
  const route = kind === ReportExport.kpis ? reports()['kpis.csv'] : reports()['visits.csv'];
  const res = await route.$get({ param: { orgId }, query: filterQuery(f) });
  await saveDownload(res as unknown as Response, `${kind}.csv`);
}
