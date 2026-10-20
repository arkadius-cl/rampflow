import { createServerI18n } from '@rampflow/i18n/server';
import { STAFF_LOCALES, type StaffLocale } from '@rampflow/shared';
import { RegisterFilter, RegisterSearchBody } from '@rampflow/shared/modules/safety/api.register';
import { Permission, StoryId } from '@rampflow/shared/values';
import { Hono } from 'hono';
import { requirePermission } from '../../../kernel/access.ts';
import { file, op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { userDisplay } from '../../../kernel/users.ts';
import { validate } from '../../../kernel/validate.ts';
import { tenantActor } from '../authoring/actor.ts';
import { exportRegister, registerFilterOptions, searchRegister } from './acknowledgements.ts';
import { registerCsv } from './csv.ts';

const view = requirePermission(Permission.safety.view_register);

const isStaffLocale = (l: string | null | undefined): l is StaffLocale =>
  (STAFF_LOCALES as readonly string[]).includes(l ?? '');

/**
 * SF-03. Mounted at `/api/t/:orgId/safety` with `withModule('safety')`. Filters travel in POST
 * bodies because the driver name is a personal search term (API conventions, "Requests").
 */
export const tenant = new Hono<AppEnv>()
  .get(
    '/acknowledgements/filters',
    op({
      id: 'safety.register.getRegisterFilters',
      stories: [StoryId.SF_03],
      description:
        '`{ instructions, carriers }`: every instruction (archived too) with its non-draft versions, newest first, and the carriers of the bookings that have acknowledgements; the choices of the register filters, because `safety.view_register` alone cannot list instructions',
      responses: {},
    }),
    view,
    async (c) => {
      return c.json(await registerFilterOptions(c.var.db, tenantActor(c).tenantId), 200);
    },
  )
  .post(
    '/acknowledgements/search',
    op({
      id: 'safety.register.searchAcknowledgements',
      stories: [StoryId.SF_03],
      description:
        '`{ siteId?, carrierId?, driverName?, instructionId?, versionId?, status?, limit?, cursor? }`; newest first, paginated; `status` is `valid`, `visit_only`, `expired` or `outdated` from `acknowledgementStatus`; restricted rows (TN-06) are left out',
      responses: {},
    }),
    view,
    validate('json', RegisterSearchBody),
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
  .post(
    '/acknowledgements.csv',
    op({
      id: 'safety.register.exportAcknowledgements',
      stories: [StoryId.SF_03],
      description:
        'same filters without paging, up to 50,000 rows; CSV format of [Time and formats](#time-and-formats)',
      responses: { 200: file('text/csv') },
    }),
    view,
    validate('json', RegisterFilter),
    async (c) => {
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
    },
  );
