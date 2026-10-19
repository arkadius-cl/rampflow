// Applies the retention rules once and exits (PL-05, ADR-0010):
//   pnpm retention:run
// Deployment schedules it daily (cron, systemd timer or the platform's scheduler). It connects
// as the app role like the API and prints the counts of the run, never a value.
import { pool } from '../src/db/pool.ts';
import { systemClock } from '../src/kernel/clock.ts';
import { runJobTick } from '../src/kernel/jobs.ts';
import { smtpMailer } from '../src/kernel/mailer.ts';
import { job } from '../src/modules/privacy/jobs/retention.ts';

try {
  const result = await runJobTick(job, { clock: systemClock, mailer: smtpMailer() });
  if (!result.ran) {
    console.log('retention: another run holds the lock; nothing done');
  } else {
    console.log(`retention: ${JSON.stringify(result.stats)}`);
    if (result.stats.failedTenants) process.exitCode = 1;
  }
} finally {
  await pool.end();
}
