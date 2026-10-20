import type { ValueOf } from './define.ts';

/** Every error code of docs/reference/api-routes.md. The UI shows `core:errors.<code>`. */
export const ErrorCode = {
  bad_request: 'bad_request',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  entitlement_required: 'entitlement_required',
  not_found: 'not_found',
  conflict: 'conflict',
  limit_reached: 'limit_reached',
  validation_failed: 'validation_failed',
  rate_limited: 'rate_limited',
  internal_error: 'internal_error',
} as const;
export type ErrorCode = ValueOf<typeof ErrorCode>;

/** `details.reason` of a 409 `conflict`. The UI shows `core:errors.conflict.<reason>`. */
export const ConflictReason = {
  capacity_full: 'capacity_full',
  daily_cap_reached: 'daily_cap_reached',
  closed: 'closed',
  not_offered: 'not_offered',
  dock_occupied: 'dock_occupied',
  dock_in_resource: 'dock_in_resource',
  dock_inactive: 'dock_inactive',
  invalid_transition: 'invalid_transition',
  cutoff_passed: 'cutoff_passed',
  stale_version: 'stale_version',
  not_due: 'not_due',
  duplicate_reference: 'duplicate_reference',
  duplicate_code: 'duplicate_code',
  already_member: 'already_member',
  holiday_closure: 'holiday_closure',
  manual_closure: 'manual_closure',
  safety_missing: 'safety_missing',
  acknowledgement_invalid: 'acknowledgement_invalid',
  quiz_incomplete: 'quiz_incomplete',
  quiz_not_passed: 'quiz_not_passed',
} as const;
export type ConflictReason = ValueOf<typeof ConflictReason>;

/** `details.reason` of a 400 `bad_request`. */
export const BadRequestReason = {
  /** The body is not parseable JSON. */
  malformed: 'malformed',
  unknown_key: 'unknown_key',
  reserved_key: 'reserved_key',
  invalid_value: 'invalid_value',
  scope_not_allowed: 'scope_not_allowed',
} as const;
export type BadRequestReason = ValueOf<typeof BadRequestReason>;

/** `details.reason` of a 401 `unauthorized`. */
export const UnauthorizedReason = {
  /** The email has an account: the caller signs in first, then redeems the token. */
  sign_in_required: 'sign_in_required',
} as const;
export type UnauthorizedReason = ValueOf<typeof UnauthorizedReason>;

/** `details.reason` of a 403 `forbidden`. */
export const ForbiddenReason = {
  carrier_admin_required: 'carrier_admin_required',
  link_inactive: 'link_inactive',
  origin: 'origin',
} as const;
export type ForbiddenReason = ValueOf<typeof ForbiddenReason>;
