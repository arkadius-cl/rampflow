import type { RouterRoute } from 'hono/types';
import type * as z from 'zod';
import {
  describedBy,
  type Guard,
  type OpMeta,
  type ValidationTarget,
} from '../../src/kernel/describe.ts';
import {
  type Endpoint,
  endpointKey,
  GeneratorError,
  HTTP_METHODS,
  type HttpMethod,
  type Party,
} from './model.ts';

/** First match wins, so the more specific prefix comes first. */
const PARTY_PREFIXES: readonly (readonly [string, Party])[] = [
  ['/api/c/:orgId/at/:tenantId', 'carrier_at_tenant'],
  // The one /api/auth route that runs in the user scope.
  ['/api/auth/logout', 'user'],
  ['/api/c/:orgId', 'carrier'],
  ['/api/t/:orgId', 'tenant'],
  ['/api/platform', 'platform'],
  ['/api/driver', 'driver'],
  ['/api/public', 'public'],
  ['/api/auth', 'anonymous'],
  ['/api/me', 'user'],
  ['/api/health', 'anonymous'],
];

/** Mounted only in tests or development, and never part of the description. */
const EXCLUDED = ['/api/test', '/api/docs', '/api/openapi.json'];

const excluded = (path: string) => EXCLUDED.some((p) => path === p || path.startsWith(`${p}/`));

export function partyOf(path: string): Party | null {
  const hit = PARTY_PREFIXES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return hit?.[1] ?? null;
}

const isMethod = (m: string): m is HttpMethod => (HTTP_METHODS as readonly string[]).includes(m);

/** Whether Hono runs a middleware registered at `pattern` for a request to `path`. */
export function patternMatches(pattern: string, path: string): boolean {
  const want = pattern.split('/');
  const have = path.split('/');
  for (const [i, segment] of want.entries()) {
    if (segment === '*' && i === want.length - 1) return true;
    const actual = have[i];
    if (actual === undefined) return false;
    if (segment.startsWith(':')) continue;
    if (segment !== actual) return false;
  }
  return want.length === have.length;
}

/**
 * The endpoints of an app from `app.routes`, joined with the registry (design D2, D8). Guards
 * come from every entry Hono runs for the endpoint, so a sibling router's `.use()` counts too.
 * The endpoints keep the order of `app.routes`, which is the order of the router files.
 */
export function collectEndpoints(routes: readonly RouterRoute[]): Endpoint[] {
  const problems: string[] = [];
  const own = new Map<string, RouterRoute[]>();
  for (const r of routes) {
    if (!isMethod(r.method) || excluded(r.path)) continue;
    const key = `${r.method} ${r.path}`;
    own.set(key, [...(own.get(key) ?? []), r]);
  }
  const endpoints: Endpoint[] = [];
  for (const [key, entries] of own) {
    const { method, path } = entries[0] as RouterRoute & { method: HttpMethod };
    const party = partyOf(path);
    if (!party) problems.push(`${key}: matches no party prefix`);
    const ops: OpMeta[] = [];
    const validators: Partial<Record<ValidationTarget, z.ZodType>> = {};
    for (const e of entries) {
      const d = describedBy(e.handler);
      if (d?.kind === 'op') ops.push(d.meta);
      if (d?.kind === 'validator') validators[d.target] = d.schema;
    }
    if (ops.length !== 1) problems.push(`${key}: needs exactly one op(), has ${ops.length}`);
    const guards: Guard[] = [];
    for (const r of routes) {
      if (r.method !== 'ALL' && r.method !== method) continue;
      if (!patternMatches(r.path, path)) continue;
      const d = describedBy(r.handler);
      if (d?.kind === 'guard' && !guards.some((g) => sameGuard(g, d.guard))) guards.push(d.guard);
    }
    const [meta] = ops;
    if (party && meta && ops.length === 1) {
      endpoints.push({ method, path, party, meta, validators, guards });
    }
  }
  const byId = new Map<string, string[]>();
  for (const e of endpoints) byId.set(e.meta.id, [...(byId.get(e.meta.id) ?? []), endpointKey(e)]);
  for (const [id, keys] of byId) {
    if (keys.length > 1) problems.push(`operation id ${id} is used by ${keys.join(', ')}`);
  }
  if (problems.length) throw new GeneratorError(problems);
  return endpoints;
}

const sameGuard = (a: Guard, b: Guard) => JSON.stringify(a) === JSON.stringify(b);
