import { zValidator } from '@hono/zod-validator';
import { createServerI18n } from '@rampflow/i18n/server';
import { STAFF_LOCALES, type StaffLocale } from '@rampflow/shared';
import { RegisterFilter, RegisterSearchBody } from '@rampflow/shared/modules/safety/api.register';
import { Hono } from 'hono';
import { requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { userDisplay } from '../../../kernel/users.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { tenantActor } from '../authoring/actor.ts';
import { exportRegister, searchRegister } from './acknowledgements.ts';
import { registerCsv } from './csv.ts';

const view = requirePermission('safety.view_register');

const isStaffLocale = (l: string | null | undefined): l is StaffLocale =>
  (STAFF_LOCALES as readonly string[]).includes(l ?? '');

/**
 * SF-03. Mounted at `/api/t/:orgId/safety` with `withModule('safety')`. Filters travel in POST
 * bodies because the driver name is a personal search term (API conventions, "Requests").
 */
export const tenant = new Hono<AppEnv>()
  .post(
    '/acknowledgements/search',
    view,
    zValidator('json', RegisterSearchBody, onInvalid),
    async (c) => {
      const { limit, cursor, ...filter } = c.req.valid('json');
      const page = await searchRegister(c.var.db, {
        tenantId: tenantActor(c).tenantId,
        filter,
        now: c.var.clock.now(),
        limit,
        cursor,
      });
      return c.json(page, 200);
    },
  )
  .post('/acknowledgements.csv', view, zValidator('json', RegisterFilter, onInvalid), async (c) => {
    const { tenantId, userId } = tenantActor(c);
    const now = c.var.clock.now();
    const items = await exportRegister(c.var.db, { tenantId, filter: c.req.valid('json'), now });
    const user = userId ? (await userDisplay(c.var.db, [userId])).get(userId) : undefined;
    const locale = isStaffLocale(user?.locale) ? user.locale : 'en';
    const i18n = await createServerI18n(locale);
    const day = now.toISOString().slice(0, 10);
    return c.body(registerCsv(items, locale, i18n.t), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="acknowledgements-${day}.csv"`,
    });
  });
