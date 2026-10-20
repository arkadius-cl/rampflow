import type { ValueOf } from './define.ts';

/** The request methods the API routes use. */
export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;
export type HttpMethod = ValueOf<typeof HttpMethod>;

/** The method of a Hono route: a request method, or `ALL` for middleware mounted with `.use()`. */
export const RouteMethod = {
  ...HttpMethod,
  ALL: 'ALL',
} as const;
export type RouteMethod = ValueOf<typeof RouteMethod>;

/** The parts of a request a route validates with `validate(target, schema)`. */
export const ValidationTarget = {
  param: 'param',
  query: 'query',
  json: 'json',
} as const;
export type ValidationTarget = ValueOf<typeof ValidationTarget>;

/** Where an OpenAPI parameter goes. */
export const ParameterLocation = {
  path: 'path',
  query: 'query',
} as const;
export type ParameterLocation = ValueOf<typeof ParameterLocation>;

/** What `GET /api/health` answers: all is well, or the database does not answer. */
export const HealthStatus = {
  ok: 'ok',
  degraded: 'degraded',
} as const;
export type HealthStatus = ValueOf<typeof HealthStatus>;

/** The database part of `GET /api/health`. */
export const DatabaseHealth = {
  ok: 'ok',
  error: 'error',
} as const;
export type DatabaseHealth = ValueOf<typeof DatabaseHealth>;
