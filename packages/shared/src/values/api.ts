import type { ValueOf } from './define.ts';

// What the API's route registry records for its description (ADR-0013, `kernel/describe.ts`).

/** A response or request body: JSON, none, or a file such as a CSV export or an image. */
export const BodyKind = {
  json: 'json',
  empty: 'empty',
  file: 'file',
} as const;
export type BodyKind = ValueOf<typeof BodyKind>;

/** What a guard in a route's chain checks. */
export const GuardKind = {
  permission: 'permission',
  entitlement: 'entitlement',
  module: 'module',
} as const;
export type GuardKind = ValueOf<typeof GuardKind>;

/** The middleware a route registers: its operation metadata, a validator, or a guard. */
export const DescribedKind = {
  op: 'op',
  validator: 'validator',
  guard: 'guard',
} as const;
export type DescribedKind = ValueOf<typeof DescribedKind>;

/** The sections of docs/reference/api-routes.md; the values are their headings. */
export const ApiSection = {
  auth: 'Auth, me and invitations',
  platform: 'Platform administration',
  tenant: 'Tenant administration',
  master_data: 'Master data and capacity',
  safety: 'Safety authoring and register',
  bookings: 'Bookings (staff)',
  carriers: 'Carrier network',
  portal: 'Carrier booking portal',
  yard: 'Yard',
  driver: 'Driver',
  reports: 'Reports',
  privacy: 'Privacy',
} as const;
export type ApiSection = ValueOf<typeof ApiSection>;

/** The `type` keyword of JSON Schema. */
export const JsonSchemaType = {
  string: 'string',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
  null: 'null',
  array: 'array',
  object: 'object',
} as const;
export type JsonSchemaType = ValueOf<typeof JsonSchemaType>;

/** The `type` of an OpenAPI security scheme; the API's sessions are cookies, so `apiKey`. */
export const SecuritySchemeType = {
  apiKey: 'apiKey',
} as const;
export type SecuritySchemeType = ValueOf<typeof SecuritySchemeType>;
