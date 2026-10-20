import { HttpMethod } from '@rampflow/shared/values';
import { defineRouteCases } from '../../../../test/route-cases.ts';

export const cases = defineRouteCases([
  {
    method: HttpMethod.GET,
    path: '/api/driver/booking',
    as: 'driver',
    permission: 'driver',
    entitlement: null,
    params: () => ({}),
    foreign: 'empty',
    siteScoped: false,
  },
]);
