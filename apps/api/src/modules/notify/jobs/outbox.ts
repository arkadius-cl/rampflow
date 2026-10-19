import type { Job } from '../../../kernel/jobs.ts';
import { deliverOutbox } from '../../../kernel/outbox.ts';

export const job: Job = {
  name: 'outbox',
  everySeconds: 5,
  run: (ctx) => deliverOutbox(ctx),
};
