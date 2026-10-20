import type {
  HardLimitKey,
  ImplementedFeatureKey,
  ModuleId,
  PermissionKey,
} from '@rampflow/shared';
import { StoryId, values } from '@rampflow/shared/values';
import type { MiddlewareHandler } from 'hono';
import type * as z from 'zod';

// What scripts/openapi.ts reads about the routes (ADR-0013). Route files call op() and validate();
// access.ts tags its guards. The registry has no effect on how a request is handled.

export { StoryId };
export const STORY_IDS = values(StoryId);

/** `<module>.<area>.<verbNoun>`, unique across the API. */
export type OperationId = `${string}.${string}.${string}`;

declare const declared: unique symbol;

/** A JSON body of type `T`. Only the static half of the generator reads `T`. */
export interface JsonBody<T> {
  readonly kind: 'json';
  readonly [declared]?: T;
}
export interface NoBody {
  readonly kind: 'empty';
}
/** A body that is not JSON: a CSV export, an uploaded or served image. */
export interface FileBody {
  readonly kind: 'file';
  readonly mediaTypes: readonly [string, ...string[]];
}
export type Body = JsonBody<unknown> | NoBody | FileBody;

export type SuccessStatus = 200 | 201 | 202 | 204;

export function type<T>(): JsonBody<T> {
  return { kind: 'json' };
}

export const noBody: NoBody = { kind: 'empty' };

export function file(...mediaTypes: [string, ...string[]]): FileBody {
  return { kind: 'file', mediaTypes };
}

export interface OpMeta {
  id: OperationId;
  stories: readonly StoryId[];
  /** Markdown; the notes cell of the route table in docs/reference/api-routes.md. */
  description: string;
  /** Hard limits the service checks with `withinLimit`, which the route chain cannot show. */
  limits?: readonly HardLimitKey[];
  /** A request body that is not JSON; JSON bodies come from `validate('json', ...)`. */
  body?: FileBody;
  responses: Partial<Record<SuccessStatus, Body>>;
}

export type Guard =
  | { kind: 'permission'; key: PermissionKey }
  | { kind: 'entitlement'; key: ImplementedFeatureKey }
  | { kind: 'module'; id: ModuleId };

export type ValidationTarget = 'param' | 'query' | 'json';

export type Described =
  | { kind: 'op'; meta: OpMeta }
  | { kind: 'validator'; target: ValidationTarget; schema: z.ZodType }
  | { kind: 'guard'; guard: Guard };

// biome-ignore lint/complexity/noBannedTypes: keyed by the middleware functions Hono stores in app.routes
const registry = new WeakMap<Function, Described>();

// biome-ignore lint/complexity/noBannedTypes: see registry
export function register<H extends Function>(handler: H, described: Described): H {
  registry.set(handler, described);
  return handler;
}

// biome-ignore lint/complexity/noBannedTypes: see registry
export function describedBy(handler: Function): Described | undefined {
  return registry.get(handler);
}

/** The operation metadata of a route. Goes first in the route's chain. */
export function op(meta: OpMeta): MiddlewareHandler {
  return register<MiddlewareHandler>(async (_c, next) => next(), { kind: 'op', meta });
}
