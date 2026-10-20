import { NodeEnv } from '@rampflow/shared/values';
import * as z from 'zod';
import type { Scope, Tx } from '../db/scope.ts';
import type { Access } from './access.ts';
import type { Clock } from './clock.ts';

const flag = z.enum(['0', '1']).transform((v) => v === '1');

/** A bare http(s) origin such as `http://192.168.0.10:5173`, normalized without a trailing slash. */
const origin = z
  .url({ protocol: /^https?$/ })
  .transform((u) => new URL(u))
  .refine((u) => u.pathname === '/' && !u.search && !u.hash, 'Expected an origin without a path')
  .transform((u) => u.origin);

/** Comma-separated origins, e.g. the LAN addresses of a dev machine (scripts/checkout-env.mjs). */
const originList = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  )
  .pipe(z.array(origin));

const EnvSchema = z
  .object({
    // Production unless said otherwise: a deployment that forgets NODE_ENV must still refuse the
    // dev secret, the test routes and the API docs and send Secure cookies. Dev and tests set it
    // explicitly (.env.example through scripts/checkout-env.mjs, vitest.config.ts,
    // playwright.config.ts).
    NODE_ENV: z.enum(NodeEnv).default(NodeEnv.production),
    API_PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
    APP_ORIGIN: z.url().default('http://localhost:5173'),
    // Further origins the Origin check accepts; dev lists the machine's other addresses.
    APP_EXTRA_ORIGINS: originList.default([]),
    TOKEN_SECRET: z.string().min(32).default('dev-only-token-secret-change-me-0000'),
    TRUST_PROXY: flag.default(false),
    ENABLE_JOBS: flag.default(true),
    ENABLE_TEST_ROUTES: flag.default(false),
    // Swagger UI and the OpenAPI document at /api/docs and /api/openapi.json, development only.
    ENABLE_API_DOCS: flag.default(false),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    MAIL_FROM: z.string().default('rampflow <no-reply@rampflow.local>'),
  })
  .refine((e) => !(e.ENABLE_TEST_ROUTES && e.NODE_ENV === NodeEnv.production), {
    message: 'ENABLE_TEST_ROUTES=1 is not allowed with NODE_ENV=production',
    path: ['ENABLE_TEST_ROUTES'],
  })
  .refine((e) => !(e.ENABLE_API_DOCS && e.NODE_ENV === NodeEnv.production), {
    message: 'ENABLE_API_DOCS=1 is not allowed with NODE_ENV=production',
    path: ['ENABLE_API_DOCS'],
  })
  .refine((e) => e.NODE_ENV !== NodeEnv.production || !e.TOKEN_SECRET.startsWith('dev-only'), {
    message: 'Set TOKEN_SECRET in production',
    path: ['TOKEN_SECRET'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);

/** Hono variables of every API request (module contract, "Request environment"). */
export interface AppEnv {
  Variables: {
    scope: Scope;
    db: Tx;
    clock: Clock;
    access: Access;
  };
}
