import type {
  Instruction,
  VersionDetail,
  VersionSummary,
} from '@rampflow/shared/modules/safety/api.authoring';
import type {
  RegisterFilter,
  RegisterFilterOptions,
  RegisterPage,
} from '@rampflow/shared/modules/safety/api.register';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api, call } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

// Queries of the safety screens. Every key starts with ['tenant', orgId, 'safety'], so one
// invalidation of `safetyKey(orgId)` refreshes the briefing list, the editor and the register.

export const safetyKey = (orgId: string) => [...queryKeys.org('tenant', orgId), 'safety'] as const;

const safety = () => api.t[':orgId'].safety;

export const instructionsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...safetyKey(orgId), 'instructions'],
    queryFn: () => call<{ items: Instruction[] }>(safety().instructions.$get({ param: { orgId } })),
    select: (data) => data.items,
  });

export const versionsQuery = (orgId: string, instructionId: string) =>
  queryOptions({
    queryKey: [...safetyKey(orgId), 'versions', instructionId],
    queryFn: () =>
      call<{ items: VersionSummary[] }>(
        safety().instructions[':instructionId'].versions.$get({
          param: { orgId, instructionId },
        }),
      ),
    select: (data) => data.items,
  });

export const versionQuery = (orgId: string, versionId: string) =>
  queryOptions({
    queryKey: [...safetyKey(orgId), 'version', versionId],
    queryFn: () =>
      call<VersionDetail>(safety().versions[':versionId'].$get({ param: { orgId, versionId } })),
  });

export const registerFilterOptionsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...safetyKey(orgId), 'register', 'filters'],
    queryFn: () =>
      call<RegisterFilterOptions>(safety().acknowledgements.filters.$get({ param: { orgId } })),
  });

const PAGE_SIZE = 50;

export const registerQuery = (orgId: string, filter: RegisterFilter) =>
  infiniteQueryOptions({
    queryKey: [...safetyKey(orgId), 'register', 'search', filter],
    queryFn: ({ pageParam }) =>
      call<RegisterPage>(
        safety().acknowledgements.search.$post({
          param: { orgId },
          json: { ...filter, limit: PAGE_SIZE, cursor: pageParam },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

/** The CSV export of the register with the same filters, as a file download. */
export async function downloadRegisterCsv(orgId: string, filter: RegisterFilter): Promise<void> {
  const res = await safety()['acknowledgements.csv'].$post({ param: { orgId }, json: filter });
  if (!res.ok) await call(Promise.resolve(res));
  const name =
    /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ??
    'acknowledgements.csv';
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
