import * as z from 'zod';
import type { Scope, Tx } from '../db/scope.ts';
import type { Access } from './access.ts';
import type { Clock } from './clock.ts';

const flag = z.enum(['0', '1']).transform((v) => v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
    APP_ORIGIN: z.url().default('http://localhost:5173'),
    TOKEN_SECRET: z.string().min(32).default('dev-only-token-secret-change-me-0000'),
    TRUST_PROXY: flag.default(false),
    ENABLE_JOBS: flag.default(true),
    ENABLE_TEST_ROUTES: flag.default(false),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    MAIL_FROM: z.string().default('rampflow <no-reply@rampflow.local>'),
  })
  .refine((e) => !(e.ENABLE_TEST_ROUTES && e.NODE_ENV === 'production'), {
    message: 'ENABLE_TEST_ROUTES=1 is not allowed with NODE_ENV=production',
    path: ['ENABLE_TEST_ROUTES'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || !e.TOKEN_SECRET.startsWith('dev-only'), {
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
