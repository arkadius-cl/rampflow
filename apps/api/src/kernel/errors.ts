import type { ConflictReason, ForbiddenReason, UnauthorizedReason } from '@rampflow/shared/values';
import { BadRequestReason, ErrorCode } from '@rampflow/shared/values';
import { DrizzleQueryError } from 'drizzle-orm';
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Every error code of docs/reference/api-routes.md, with the status it always answers. */
export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  entitlement_required: 403,
  not_found: 404,
  conflict: 409,
  limit_reached: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal_error: 500,
  onboarding_incomplete: 409,
} as const satisfies Record<ErrorCode, ContentfulStatusCode>;

export type ErrorDetails = Readonly<Record<string, unknown>>;
/** A 409 `conflict` always names its reason, so the client can explain it. */
export type ConflictDetails = { readonly reason: ConflictReason } & ErrorDetails;
/** Details of a 400, 401 or 403, whose `reason` is one of that status's set. */
export type ReasonDetails<R extends string> = { readonly reason?: R } & ErrorDetails;
/** The codes whose details carry no `reason`. */
type Unreasoned = Exclude<
  ErrorCode,
  | typeof ErrorCode.conflict
  | typeof ErrorCode.bad_request
  | typeof ErrorCode.unauthorized
  | typeof ErrorCode.forbidden
>;

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetails };
}

export const DEFAULT_MESSAGE = {
  bad_request: 'Bad request',
  unauthorized: 'Sign in required',
  forbidden: 'Not allowed',
  entitlement_required: 'Not included in the package',
  not_found: 'Not found',
  conflict: 'Conflict',
  limit_reached: 'Package limit reached',
  validation_failed: 'Validation failed',
  rate_limited: 'Too many requests',
  internal_error: 'Internal server error',
  onboarding_incomplete: 'Finish onboarding first: add a site, a hall and a dock',
} as const satisfies Record<ErrorCode, string>;

/** Throw from handlers and services. The scoped transaction rolls back; the client gets the envelope. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details: ErrorDetails | undefined;

  constructor(code: typeof ErrorCode.conflict, message: string, details: ConflictDetails);
  constructor(
    code: typeof ErrorCode.bad_request,
    message?: string,
    details?: ReasonDetails<BadRequestReason>,
  );
  constructor(
    code: typeof ErrorCode.unauthorized,
    message?: string,
    details?: ReasonDetails<UnauthorizedReason>,
  );
  constructor(
    code: typeof ErrorCode.forbidden,
    message?: string,
    details?: ReasonDetails<ForbiddenReason>,
  );
  constructor(code: Unreasoned, message?: string, details?: ReasonDetails<never>);
  constructor(code: ErrorCode, message: string = DEFAULT_MESSAGE[code], details?: ErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  /** The same error with more details. A conflict keeps the reason its constructor demanded. */
  withDetails(extra: ErrorDetails & { readonly reason?: never }): ApiError {
    const details: ErrorDetails = { ...this.details, ...extra };
    // The constructor checked the reason of `this.details`, and `extra` adds none.
    const Same = ApiError as unknown as new (
      code: ErrorCode,
      message: string,
      details: ErrorDetails,
    ) => ApiError;
    return new Same(this.code, this.message, details);
  }

  body(): ErrorBody {
    const { code, message, details } = this;
    return { error: details ? { code, message, details } : { code, message } };
  }
}

function fromHttpException(err: HTTPException): ApiError {
  if (err.status === 400)
    return new ApiError(ErrorCode.bad_request, err.message, { reason: BadRequestReason.malformed });
  if (err.status === 401) return new ApiError(ErrorCode.unauthorized, err.message);
  if (err.status === 403) return new ApiError(ErrorCode.forbidden, err.message);
  if (err.status === 404) return new ApiError(ErrorCode.not_found, err.message);
  return new ApiError(ErrorCode.internal_error);
}

/** The fields of a node-postgres `DatabaseError` that name what failed without quoting any value. */
interface PgErrorFields {
  code?: unknown;
  constraint?: unknown;
  table?: unknown;
  column?: unknown;
}

/**
 * A log line for an unexpected error. A failed query names its class, SQL state, constraint and
 * statement text but never the bound parameters or Postgres' message, which quote emails,
 * password hashes and driver data; other errors keep their stack.
 */
export function describeForLog(err: unknown): string {
  if (err instanceof DrizzleQueryError) {
    const cause = (err.cause ?? {}) as Error & PgErrorFields;
    const fields = Object.entries({
      code: cause.code,
      constraint: cause.constraint,
      table: cause.table,
      column: cause.column,
    })
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => `${k}=${String(v)}`);
    return [`${err.name}(${cause.name ?? 'Error'})`, ...fields, `query: ${err.query}`].join(' ');
  }
  // A DatabaseError of node-postgres outside Drizzle: its message may quote a value too.
  if (
    err instanceof Error &&
    'severity' in err &&
    typeof (err as PgErrorFields).code === 'string'
  ) {
    return `${err.name} code=${String((err as PgErrorFields).code)}`;
  }
  return err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
}

export const onError: ErrorHandler = (err, c) => {
  const apiError =
    err instanceof ApiError
      ? err
      : err instanceof HTTPException
        ? fromHttpException(err)
        : new ApiError(ErrorCode.internal_error);
  if (apiError.code === ErrorCode.internal_error) {
    const requestId = crypto.randomUUID();
    console.error(
      `internal_error ${requestId} ${c.req.method} ${c.req.routePath} ${describeForLog(err)}`,
    );
    return c.json<ErrorBody>(
      {
        error: {
          code: ErrorCode.internal_error,
          message: DEFAULT_MESSAGE.internal_error,
          details: { requestId },
        },
      },
      500,
    );
  }
  return c.json(apiError.body(), apiError.status);
};

export const onNotFound: NotFoundHandler = (c) =>
  c.json<ErrorBody>({ error: { code: ErrorCode.not_found, message: 'No such route' } }, 404);
