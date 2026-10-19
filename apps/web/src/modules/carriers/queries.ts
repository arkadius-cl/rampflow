import type {
  CarrierNetwork,
  LinkedTenant,
  PublicLinkView,
  RegistrationView,
} from '@rampflow/shared/modules/booking/api.carriers';
import { queryOptions } from '@tanstack/react-query';
import { api, call } from '@/lib/api';

// Queries of the carrier network (TN-03, TN-04, CR-02). Keys follow lib/query-keys.ts:
// [area, orgId, 'booking', 'carriers', ...], so one invalidation of
// ['tenant', orgId, 'booking', 'carriers'] refreshes every tab.

export const carrierKeys = {
  all: (orgId: string) => ['tenant', orgId, 'booking', 'carriers'] as const,
  network: (orgId: string) => [...carrierKeys.all(orgId), 'network'] as const,
  registrations: (orgId: string) => [...carrierKeys.all(orgId), 'registrations'] as const,
  publicLinks: (orgId: string) => [...carrierKeys.all(orgId), 'public-links'] as const,
  tenants: (orgId: string) => ['carrier', orgId, 'booking', 'tenants'] as const,
};

const carriers = api.t[':orgId'].carriers;

export const networkQuery = (orgId: string) =>
  queryOptions({
    queryKey: carrierKeys.network(orgId),
    queryFn: () => call<CarrierNetwork>(carriers.$get({ param: { orgId } })),
  });

export const registrationsQuery = (orgId: string) =>
  queryOptions({
    queryKey: carrierKeys.registrations(orgId),
    queryFn: () =>
      call<{ items: RegistrationView[] }>(carriers.registrations.$get({ param: { orgId } })),
  });

export const publicLinksQuery = (orgId: string) =>
  queryOptions({
    queryKey: carrierKeys.publicLinks(orgId),
    queryFn: () =>
      call<{ items: PublicLinkView[] }>(carriers['public-links'].$get({ param: { orgId } })),
  });

export const linkedTenantsQuery = (orgId: string) =>
  queryOptions({
    queryKey: carrierKeys.tenants(orgId),
    queryFn: () =>
      call<{ items: LinkedTenant[] }>(api.c[':orgId'].tenants.$get({ param: { orgId } })),
  });

/** The public booking link of a slug, as carriers open it. */
export const publicLinkUrl = (slug: string) => `${window.location.origin}/r/${slug}`;
