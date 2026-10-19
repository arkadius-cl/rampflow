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
} as const satisfies Record<string, ContentfulStatusCode>;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type ErrorDetails = Readonly<Record<string, unknown>>;

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetails };
}

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
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
};

/** Throw from handlers and services. The scoped transaction rolls back; the client gets the envelope. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string = DEFAULT_MESSAGE[code], details?: ErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  body(): ErrorBody {
    const { code, message, details } = this;
    return { error: details ? { code, message, details } : { code, message } };
  }
}

function fromHttpException(err: HTTPException): ApiError {
  if (err.status === 400) return new ApiError('bad_request', err.message, { reason: 'malformed' });
  if (err.status === 401) return new ApiError('unauthorized', err.message);
  if (err.status === 403) return new ApiError('forbidden', err.message);
  if (err.status === 404) return new ApiError('not_found', err.message);
  return new ApiError('internal_error');
}

export const onError: ErrorHandler = (err, c) => {
  const apiError =
    err instanceof ApiError
      ? err
      : err instanceof HTTPException
        ? fromHttpException(err)
        : new ApiError('internal_error');
  if (apiError.code === 'internal_error') {
    const requestId = crypto.randomUUID();
    console.error(`internal_error ${requestId} ${c.req.method} ${c.req.routePath}`, err);
    return c.json<ErrorBody>(
      {
        error: {
          code: 'internal_error',
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
  c.json<ErrorBody>({ error: { code: 'not_found', message: 'No such route' } }, 404);
