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
