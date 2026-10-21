import { zValidator } from '@hono/zod-validator';
import { DescribedKind, ErrorCode, ValidationTarget } from '@rampflow/shared/values';
import type { ValidationTargets } from 'hono';
import type * as z from 'zod';
import { register } from './describe.ts';
import { ApiError } from './errors.ts';

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly code: string;
  readonly message: string;
  readonly params?: { readonly code?: unknown };
}

type ValidationResult =
  | { success: true; target: keyof ValidationTargets }
  | { success: false; target: keyof ValidationTargets; error: { issues: readonly Issue[] } };

/**
 * A bad path parameter is an unknown id, so it answers 404; a bad query or body answers 422 with
 * the zod issue paths. A refinement names its own code in `params.code` (`TaxIdCheck`).
 */
function onInvalid(result: ValidationResult): void {
  if (result.success) return;
  if (result.target === ValidationTarget.param) throw new ApiError(ErrorCode.not_found);
  const issues = result.error.issues.map(({ path, code, message, params }) => ({
    path: path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
    code: typeof params?.code === 'string' ? params.code : code,
    message,
  }));
  throw new ApiError(ErrorCode.validation_failed, `Invalid ${result.target}`, { issues });
}

/** Validates one part of the request and records the schema for the API description. */
export function validate<Target extends ValidationTarget, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return register(zValidator(target, schema, onInvalid), {
    kind: DescribedKind.validator,
    target,
    schema,
  });
}
