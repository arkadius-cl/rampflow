import {
  EraseRequest,
  type EraseResult,
  type SubjectMatches,
  SubjectQuery,
} from '@rampflow/shared/modules/privacy/api';
import { type Context, Hono } from 'hono';
import { requirePermission } from '../../../kernel/access.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
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
  .post(
    '/search',
    op({
      id: 'privacy.requests.searchSubject',
      stories: ['TN-06'],
      description: '`{ name?, phone?, plate? }`; matching bookings and acknowledgements',
      responses: { 200: type<SubjectMatches>() },
    }),
    manage,
    validate('json', SubjectQuery),
    async (c) => {
      return c.json(await findSubject(await subjectContext(c), c.req.valid('json')), 200);
    },
  )
  .post(
    '/export',
    op({
      id: 'privacy.requests.exportSubject',
      stories: ['TN-06'],
      description: 'The body of `POST /privacy/search`; JSON download',
      responses: {},
    }),
    manage,
    validate('json', SubjectQuery),
    async (c) => {
      const ctx = await subjectContext(c);
      const body = await exportSubject(ctx, c.req.valid('json'));
      c.header(
        'Content-Disposition',
        `attachment; filename="privacy-export-${ctx.now.toISOString().slice(0, 10)}.json"`,
      );
      return c.json(body, 200);
    },
  )
  .post(
    '/erase',
    op({
      id: 'privacy.requests.eraseSubject',
      stories: ['TN-06'],
      description:
        'The body of `POST /privacy/search` plus `{ confirm: true }`; pseudonymizes bookings, restricts acknowledgements under retention',
      responses: { 200: type<EraseResult>() },
    }),
    manage,
    validate('json', EraseRequest),
    async (c) => {
      const { confirm: _, ...subject } = c.req.valid('json');
      return c.json(await eraseSubject(await subjectContext(c), subject), 200);
    },
  );
