import type { Hono } from 'hono';
import { DRIVER_COOKIE, SESSION_COOKIE } from '../src/kernel/scopes.ts';
import type { WorldBooking, WorldUser } from './world.ts';

/** Same-origin header every mutating request needs (ADR-0003). vitest.config.ts sets APP_ORIGIN. */
export const TEST_ORIGIN = process.env.APP_ORIGIN ?? 'http://rampflow.test';

/** A signed-in user, a driver holding a booking's link, or nobody. */
export type Actor = WorldUser | Pick<WorldBooking, 'driverToken'> | null;

export interface RawBody {
  type: string;
  bytes: Uint8Array;
}

export interface RequestOptions {
  body?: unknown;
  /** A non-JSON body, for example an image upload. */
  raw?: RawBody;
  /** `null` sends no Origin header. */
  origin?: string | null;
  headers?: Record<string, string>;
}

function cookieOf(actor: Actor): string | undefined {
  if (!actor) return undefined;
  if ('sessionToken' in actor) return `${SESSION_COOKIE}=${actor.sessionToken}`;
  return `${DRIVER_COOKIE}=${actor.driverToken}`;
}

/** `as(app, actor).post('/api/...', { body })`: an HTTP request as that actor. */
export function as(app: Pick<Hono, 'request'>, actor: Actor) {
  const send = async (method: string, path: string, o: RequestOptions = {}) => {
    const headers: Record<string, string> = { ...o.headers };
    const cookie = cookieOf(actor);
    if (cookie) headers.Cookie = cookie;
    const origin = o.origin === undefined ? TEST_ORIGIN : o.origin;
    if (origin !== null) headers.Origin = origin;
    if (o.raw) {
      headers['Content-Type'] = o.raw.type;
      return app.request(path, { method, headers, body: new Uint8Array(o.raw.bytes) });
    }
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    return app.request(path, {
      method,
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
  };
  return {
    request: send,
    get: (path: string, o?: RequestOptions) => send('GET', path, o),
    post: (path: string, o?: RequestOptions) => send('POST', path, o),
    put: (path: string, o?: RequestOptions) => send('PUT', path, o),
    patch: (path: string, o?: RequestOptions) => send('PATCH', path, o),
    delete: (path: string, o?: RequestOptions) => send('DELETE', path, o),
  };
}
