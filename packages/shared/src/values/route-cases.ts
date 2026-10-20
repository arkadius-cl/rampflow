import type { ValueOf } from './define.ts';
import { OrgKind, Role } from './roles.ts';

// The leak harness of ADR-0002 (`apps/api/test/route-cases.ts`): who a case calls as, what it
// expects, and the checks it reports.

/** A role that may call a route, or a driver holding the link of `A.bookings.own`. */
export const RouteCaseActor = {
  ...Role,
  driver: 'driver',
} as const;
export type RouteCaseActor = ValueOf<typeof RouteCaseActor>;

/** A route that needs no permission: any member of the org, or the driver of the booking. */
export const RouteCaseGrant = {
  member: 'member',
  driver: RouteCaseActor.driver,
} as const;
export type RouteCaseGrant = ValueOf<typeof RouteCaseGrant>;

/** The party a case's actor belongs to. */
export const RouteCaseParty = {
  ...OrgKind,
  driver: RouteCaseActor.driver,
} as const;
export type RouteCaseParty = ValueOf<typeof RouteCaseParty>;

/** What world B (or a rival carrier, or a foreign site) gets: 404, or 2xx without A's data. */
export const ForeignOutcome = {
  not_found: 'not_found',
  empty: 'empty',
} as const;
export type ForeignOutcome = ValueOf<typeof ForeignOutcome>;

/** How an account route is called: with a session, an emailed token, or by anyone. */
export const AccountCredential = {
  session: 'session',
  token: 'token',
  none: 'none',
} as const;
export type AccountCredential = ValueOf<typeof AccountCredential>;

/** A failed check of an org route case. */
export const RouteCaseCheck = {
  control: 'control',
  leak: 'leak',
  foreign_org: 'foreign_org',
  rival_carrier: 'rival_carrier',
  site: 'site',
  permission: 'permission',
  entitlement: 'entitlement',
} as const;
export type RouteCaseCheck = ValueOf<typeof RouteCaseCheck>;

/** A failed check of an account route case. */
export const AccountCaseCheck = {
  anonymous: 'anonymous',
  wrong_party: 'wrong_party',
  foreign_org: RouteCaseCheck.foreign_org,
  reuse: 'reuse',
  control: RouteCaseCheck.control,
} as const;
export type AccountCaseCheck = ValueOf<typeof AccountCaseCheck>;

/** The defects the harness's self-test builds into a toy org area. */
export const RouteHarnessDefect = {
  none: 'none',
  bypasses_rls: 'bypasses_rls',
  no_permission: 'no_permission',
  no_entitlement: 'no_entitlement',
} as const;
export type RouteHarnessDefect = ValueOf<typeof RouteHarnessDefect>;

/** The defects the harness's self-test builds into a toy `/api/me`. */
export const AccountHarnessDefect = {
  none: RouteHarnessDefect.none,
  no_session: 'no_session',
  all_users: 'all_users',
  driver_is_user: 'driver_is_user',
} as const;
export type AccountHarnessDefect = ValueOf<typeof AccountHarnessDefect>;
