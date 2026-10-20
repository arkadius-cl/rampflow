import { InputKind, ZodIssueCode } from '@rampflow/shared/values';
import type { FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Resources } from '@/lib/i18n-resources.gen';

// Field errors of the sites screens in the user's language. zodResolver and applyServerIssues put
// the zod issue code into `error.type`; refinements of the shared schemas are told apart by their
// fixed English message, so packages/shared stays language-free.

type Validation = keyof Resources['core']['sites']['validation'];

const CUSTOM: Readonly<Record<string, Validation>> = {
  'Unknown IANA time zone': 'time_zone',
  'The subdivision must belong to the country': 'subdivision_country',
  'Opens before it closes': 'window_order',
  'Overlaps another window': 'overlap',
  'Starts before it ends': 'range_order',
  'The last tier has no upper bound': 'tiers',
  'Upper bounds ascend and only the last tier is open': 'tiers',
};

function validationOf(error: FieldError, kind: InputKind): Validation {
  switch (error.type) {
    case ZodIssueCode.too_small:
      return kind === InputKind.text ? 'required' : 'too_small';
    case ZodIssueCode.too_big:
      return kind === InputKind.text ? 'too_long' : 'too_big';
    case ZodIssueCode.invalid_type:
      return 'required';
    case ZodIssueCode.invalid_format:
      return 'format';
    case ZodIssueCode.not_multiple_of:
      return 'multiple_of_5';
    case ZodIssueCode.custom:
      return CUSTOM[error.message ?? ''] ?? 'invalid';
    default:
      return 'invalid';
  }
}

/** `message(fieldState.error)` for text fields, `message(error, 'number')` for numbers. */
export function useIssueText() {
  const { t } = useTranslation();
  return (error: FieldError | undefined, kind: InputKind = InputKind.text) =>
    error ? t(($) => $.sites.validation[validationOf(error, kind)]) : undefined;
}

/** An `<input type="number">` value for a nullable integer field: empty is `null`. */
export const numberOrNull = (value: string): number | null =>
  value.trim() === '' ? null : Number(value);
