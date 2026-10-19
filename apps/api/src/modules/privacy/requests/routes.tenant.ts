import { zValidator } from '@hono/zod-validator';
import { EraseRequest, SubjectQuery } from '@rampflow/shared/modules/privacy/api';
import { type Context, Hono } from 'hono';
import { requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { tenantRequest } from '../../core/sites/tenant.ts';
import { eraseSubject, exportSubject, findSubject, type SubjectContext } from './subjects.ts';

const manage = requirePermission('privacy.manage_requests');

async function subjectContext(c: Context<AppEnv>): Promise<SubjectContext> {
  const { tenantId, userId } = tenantRequest(c);
  if (!userId) throw new Error('privacy request without a user');
  return {
    tx: c.var.db,
    tenantId,
    userId,
    now: c.var.clock.now(),
    safetyAfterExpiryDays: (
      await c.var.access.setting('privacy.retention.safety_after_expiry_days', null)
    ).value,
  };
}

/**
 * TN-06. Mounted at `/api/t/:orgId/privacy`. The identifiers travel in POST bodies, so they stay
 * out of logs (API conventions, "Requests").
 */
export const tenant = new Hono<AppEnv>()
  .post('/search', manage, zValidator('json', SubjectQuery, onInvalid), async (c) => {
    return c.json(await findSubject(await subjectContext(c), c.req.valid('json')), 200);
  })
  .post('/export', manage, zValidator('json', SubjectQuery, onInvalid), async (c) => {
    const ctx = await subjectContext(c);
    const body = await exportSubject(ctx, c.req.valid('json'));
    c.header(
      'Content-Disposition',
      `attachment; filename="privacy-export-${ctx.now.toISOString().slice(0, 10)}.json"`,
    );
    return c.json(body, 200);
  })
  .post('/erase', manage, zValidator('json', EraseRequest, onInvalid), async (c) => {
    const { confirm: _, ...subject } = c.req.valid('json');
    return c.json(await eraseSubject(await subjectContext(c), subject), 200);
  });
