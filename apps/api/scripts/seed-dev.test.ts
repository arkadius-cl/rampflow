import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./seed-dev.ts', import.meta.url));

/** Runs the seed against a port nothing listens on, so a missing guard fails without writing. */
function seed(nodeEnv: string | undefined) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MIGRATION_DATABASE_URL: 'postgres://rampflow:rampflow@127.0.0.1:1/never',
  };
  if (nodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = nodeEnv;
  return spawnSync(process.execPath, ['--import', 'tsx', script], { env, encoding: 'utf8' });
}

describe('pnpm db:seed', () => {
  it('refuses to run in production and says why', () => {
    for (const nodeEnv of ['production', undefined]) {
      const run = seed(nodeEnv);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('db:seed refuses to run with NODE_ENV=production');
      expect(run.stderr).not.toContain('ECONNREFUSED');
    }
  });
});
