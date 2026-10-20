import type { ValueOf } from './define.ts';

/** The zod issue codes the code raises or checks; a 422 lists them per issue. */
export const ZodIssueCode = {
  custom: 'custom',
  invalid_type: 'invalid_type',
  invalid_format: 'invalid_format',
  invalid_value: 'invalid_value',
  too_big: 'too_big',
  too_small: 'too_small',
  not_multiple_of: 'not_multiple_of',
  unrecognized_keys: 'unrecognized_keys',
} as const;
export type ZodIssueCode = ValueOf<typeof ZodIssueCode>;
