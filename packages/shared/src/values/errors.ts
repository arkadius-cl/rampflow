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
