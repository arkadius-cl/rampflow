import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export type ApiError = { error: { code: string; message: string } };

const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable_entity',
  429: 'too_many_requests',
};

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    const code = CODE_BY_STATUS[err.status] ?? 'http_error';
    return c.json<ApiError>({ error: { code, message: err.message } }, err.status);
  }
  console.error(err);
  return c.json<ApiError>(
    { error: { code: 'internal_error', message: 'Internal server error' } },
    500,
  );
};

export const onNotFound: NotFoundHandler = (c) =>
  c.json<ApiError>({ error: { code: 'not_found', message: `No route for ${c.req.path}` } }, 404);
