import type { TFunction } from 'i18next';
import type { FieldError, FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ApiFailure } from '@/lib/api';

// Form errors in the user's language. zodResolver puts the zod issue code into `error.type`, so
// the shared schemas of packages/shared stay language-free and the message comes from the code.

/** A field error's message: by zod issue code, `password_match` for the confirm refinement. */
export function useFieldMessage() {
  const { t } = useTranslation();
  return (error: FieldError | undefined, field?: string): string | undefined => {
    if (!error) return undefined;
    if (error.type === 'custom' && error.message === 'password_match') {
      return t(($) => $.auth.validation.password_match);
    }
    if (error.type === 'invalid_format' || field === 'email')
      return t(($) => $.auth.validation.email);
    if (error.type === 'too_small' && field === 'password') {
      return t(($) => $.auth.validation.password_length);
    }
    if (error.type === 'too_big') return t(($) => $.auth.validation.too_long);
    return t(($) => $.auth.validation.required);
  };
}

/** `core:errors.<code>`, or `core:errors.conflict.<reason>` for a 409 conflict. */
export function errorText(t: TFunction<'core'>, e: ApiFailure): string {
  if (e.code !== 'conflict')
    return t(($) => $.errors[e.code as Exclude<typeof e.code, 'conflict'>]);
  const reason = e.conflictReason;
  return reason ? t(($) => $.errors.conflict[reason]) : t(($) => $.errors.conflict.default);
}

/** Puts the 422 issues of an API answer on their fields. Returns whether it did. */
export function applyServerIssues<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): boolean {
  if (!(error instanceof ApiFailure) || error.code !== 'validation_failed') return false;
  for (const issue of error.issues) {
    const [field] = issue.path;
    if (typeof field === 'string') setError(field as Path<T>, { type: issue.code });
  }
  return error.issues.length > 0;
}
