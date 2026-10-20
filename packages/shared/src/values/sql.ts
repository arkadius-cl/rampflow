import type { ValueOf } from './define.ts';

/** The Postgres SQLSTATE codes the code and the tests look for, keyed by their condition name. */
export const SqlState = {
  invalid_text_representation: '22P02',
  foreign_key_violation: '23503',
  unique_violation: '23505',
  deadlock_detected: '40P01',
  insufficient_privilege: '42501',
  duplicate_database: '42P04',
} as const;
export type SqlState = ValueOf<typeof SqlState>;
