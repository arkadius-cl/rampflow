import type {
  HardLimitKey,
  ImplementedFeatureKey,
  ModuleId,
  PermissionKey,
} from '@rampflow/shared';
import type { MiddlewareHandler } from 'hono';
import type * as z from 'zod';

// What scripts/openapi.ts reads about the routes (ADR-0013). Route files call op() and validate();
// access.ts tags its guards. The registry has no effect on how a request is handled.

/** The story IDs of docs/explanation/mvp-scope.md. */
export const STORY_IDS = [
  ...['AV-01', 'AV-02'],
  ...['BK-01', 'BK-02', 'BK-03', 'BK-04', 'BK-05', 'BK-06', 'BK-07', 'BK-08'],
  ...['CR-01', 'CR-02', 'CR-03', 'CR-04', 'CR-05', 'CR-06'],
  ...['DR-01', 'DR-02', 'DR-03'],
  ...['MD-01', 'MD-02', 'MD-03', 'MD-04', 'MD-05'],
  ...['PL-01', 'PL-02', 'PL-03', 'PL-04', 'PL-05'],
  ...['RP-01', 'RP-02'],
  ...['SF-01', 'SF-02', 'SF-03', 'SF-04'],
  ...['TN-01', 'TN-02', 'TN-03', 'TN-04', 'TN-05', 'TN-06'],
  ...['YD-01', 'YD-02', 'YD-03', 'YD-04', 'YD-05', 'YD-06', 'YD-07', 'YD-08'],
] as const;
export type StoryId = (typeof STORY_IDS)[number];

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
