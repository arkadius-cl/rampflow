import type * as z from 'zod';
import type { Guard, OpMeta, ValidationTarget } from '../../src/kernel/describe.ts';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** The parties of "Areas and parties" in docs/reference/api-routes.md. */
export type Party =
  | 'anonymous'
  | 'user'
  | 'platform'
  | 'tenant'
  | 'carrier'
  | 'carrier_at_tenant'
  | 'driver'
  | 'public';

/** One method and path of the app, with what the runtime half knows about it. */
export interface Endpoint {
  method: HttpMethod;
  /** Hono syntax, `/api/t/:orgId/sites`. */
  path: string;
  party: Party;
  meta: OpMeta;
  validators: Partial<Record<ValidationTarget, z.ZodType>>;
  /** Every guard Hono runs for the endpoint, router-level `.use()` ones included. */
  guards: readonly Guard[];
}

/** Everything the generator could not describe, one line per problem, reported together. */
export class GeneratorError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The API description has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'GeneratorError';
    this.problems = problems;
  }
}

export const endpointKey = (e: Pick<Endpoint, 'method' | 'path'>) => `${e.method} ${e.path}`;
