import {
  ForeignOutcome,
  HttpMethod,
  RouteCaseActor,
  RouteCaseGrant,
} from '@rampflow/shared/values';
import { defineRouteCases } from '../../../../test/route-cases.ts';

export const cases = defineRouteCases([
  {
    method: HttpMethod.GET,
    path: '/api/driver/booking',
    as: RouteCaseActor.driver,
    permission: RouteCaseGrant.driver,
    entitlement: null,
    params: () => ({}),
    foreign: ForeignOutcome.empty,
    siteScoped: false,
  },
]);
