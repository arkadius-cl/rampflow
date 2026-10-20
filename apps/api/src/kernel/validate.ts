import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type * as z from 'zod';
import { register, type ValidationTarget } from './describe.ts';
import { ApiError } from './errors.ts';

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly code: string;
  readonly message: string;
}

type ValidationResult =
  | { success: true; target: keyof ValidationTargets }
  | { success: false; target: keyof ValidationTargets; error: { issues: readonly Issue[] } };

/**
 * A bad path parameter is an unknown id, so it answers 404; a bad query or body answers 422 with
 * the zod issue paths.
 */
function onInvalid(result: ValidationResult): void {
  if (result.success) return;
  if (result.target === 'param') throw new ApiError('not_found');
  const issues = result.error.issues.map(({ path, code, message }) => ({
    path: path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
    code,
    message,
  }));
  throw new ApiError('validation_failed', `Invalid ${result.target}`, { issues });
}

/** Validates one part of the request and records the schema for the API description. */
export function validate<Target extends ValidationTarget, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return register(zValidator(target, schema, onInvalid), { kind: 'validator', target, schema });
}
