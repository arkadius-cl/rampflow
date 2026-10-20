import type { ValueOf } from './define.ts';

/** What the catalog check of ADR-0009 finds wrong in `packages/i18n/locales`. */
export const CatalogProblemKind = {
  invalid_json: 'invalid_json',
  unknown_namespace: 'unknown_namespace',
  missing_part: 'missing_part',
  extra_part: 'extra_part',
  missing_key: 'missing_key',
  extra_key: 'extra_key',
  empty_value: 'empty_value',
  missing_derived_part: 'missing_derived_part',
  missing_derived_key: 'missing_derived_key',
  missing_status: 'missing_status',
} as const;
export type CatalogProblemKind = ValueOf<typeof CatalogProblemKind>;
