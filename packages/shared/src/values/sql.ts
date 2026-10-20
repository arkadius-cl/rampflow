import type { ValueOf } from './define.ts';

/** The Postgres SQLSTATE codes the code and the tests look for, keyed by their condition name. */
export const SqlState = {
  invalid_text_representation: '22P02',
  foreign_key_violation: '23503',
  unique_violation: '23505',
  check_violation: '23514',
  deadlock_detected: '40P01',
  insufficient_privilege: '42501',
  duplicate_database: '42P04',
} as const;
export type SqlState = ValueOf<typeof SqlState>;

/** The `mode` of a Drizzle column: the JavaScript type its values read as. */
export const ColumnMode = {
  string: 'string',
  number: 'number',
  date: 'date',
} as const;
export type ColumnMode = ValueOf<typeof ColumnMode>;

/** What `ensureDatabase` did: made the database, or found it there. */
export const EnsureDatabaseResult = {
  created: 'created',
  exists: 'exists',
} as const;
export type EnsureDatabaseResult = ValueOf<typeof EnsureDatabaseResult>;
