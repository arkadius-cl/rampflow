import type { AppType } from '@rampflow/api';
import type { ConflictReason, ErrorCode } from '@rampflow/shared/values';
import { hc } from 'hono/client';

/** The typed API client. Same origin: Vite proxies /api in dev, one host serves both in production. */
export const api = hc<AppType>('/').api;

export interface ValidationIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

/** A non-2xx answer, parsed from the error envelope. */
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(status: number, code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = code;
    this.details = details ?? {};
  }

  get reason(): string | undefined {
    return typeof this.details.reason === 'string' ? this.details.reason : undefined;
  }

  /** The reason of a 409 `conflict`; the API always names one. */
  get conflictReason(): ConflictReason | undefined {
    return this.code === 'conflict' ? (this.details.reason as ConflictReason) : undefined;
  }

  get issues(): ValidationIssue[] {
    return Array.isArray(this.details.issues) ? (this.details.issues as ValidationIssue[]) : [];
  }
}

export const isFailure = (e: unknown, code?: ErrorCode): e is ApiFailure =>
  e instanceof ApiFailure && (code === undefined || e.code === code);

async function failureOf(res: Response): Promise<ApiFailure> {
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: ErrorCode; message?: string; details?: Record<string, unknown> };
  } | null;
  const error = body?.error;
  return new ApiFailure(
    res.status,
    error?.code ?? (res.status >= 500 ? 'internal_error' : 'bad_request'),
    error?.message ?? res.statusText,
    error?.details,
  );
}

/**
 * Awaits an `api` call and returns its JSON body, or `undefined` for 202 and 204. Throws
 * `ApiFailure` for every error answer, so queries and mutations see one error type.
 */
export async function call<T>(
  request: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<T> {
  const res = await request;
  if (!res.ok) throw await failureOf(res as unknown as Response);
  if (res.status === 202 || res.status === 204) return undefined as T;
  return res.json();
}
