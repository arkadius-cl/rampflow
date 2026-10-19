import { zValidator } from '@hono/zod-validator';
import { createServerI18n } from '@rampflow/i18n/server';
import { STAFF_LOCALES, type StaffLocale } from '@rampflow/shared';
import { ReportFilter, VisitQuery } from '@rampflow/shared/modules/report/api';
import { type Context, Hono } from 'hono';
import { requireEntitlement, requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { userDisplay } from '../../../kernel/users.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { tenantRequest } from '../../core/sites/tenant.ts';
import { kpiCsv, visitsCsv } from './csv.ts';
import { allVisits, kpiReport, type ReportContext, visitPage } from './kpis.ts';

const view = requirePermission('report.view');
const exportCsv = requireEntitlement('report.export');

function reportContext(c: Context<AppEnv>): ReportContext {
  return {
    tx: c.var.db,
    tenantId: tenantRequest(c).tenantId,
    access: c.var.access,
    now: c.var.clock.now(),
  };
}

const isStaffLocale = (l: string | null | undefined): l is StaffLocale =>
  (STAFF_LOCALES as readonly string[]).includes(l ?? '');

/** The CSV language: the user's, else the tenant's `i18n.default_locale`. */
async function csvLocale(c: Context<AppEnv>): Promise<StaffLocale> {
  const { userId } = tenantRequest(c);
  const user = userId ? (await userDisplay(c.var.db, [userId])).get(userId) : undefined;
  if (isStaffLocale(user?.locale)) return user.locale;
  return (await c.var.access.setting('i18n.default_locale', null)).value;
}

const csvHeaders = (name: string) => ({
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': `attachment; filename="${name}"`,
});

/** RP-01 and RP-02. Mounted at `/api/t/:orgId/reports` with `withModule('report')`. */
export const tenant = new Hono<AppEnv>()
  .get('/kpis', view, zValidator('query', ReportFilter, onInvalid), async (c) => {
    return c.json(await kpiReport(reportContext(c), c.req.valid('query')), 200);
  })
  .get('/kpis.csv', view, exportCsv, zValidator('query', ReportFilter, onInvalid), async (c) => {
    const filter = c.req.valid('query');
    const report = await kpiReport(reportContext(c), filter);
    const locale = await csvLocale(c);
    const { t } = await createServerI18n(locale);
    return c.body(
      kpiCsv(report, locale, t),
      200,
      csvHeaders(`kpis-${filter.from}-${filter.to}.csv`),
    );
  })
  .get('/visits', view, zValidator('query', VisitQuery, onInvalid), async (c) => {
    return c.json(await visitPage(reportContext(c), c.req.valid('query')), 200);
  })
  .get('/visits.csv', view, exportCsv, zValidator('query', ReportFilter, onInvalid), async (c) => {
    const filter = c.req.valid('query');
    const { site, items } = await allVisits(reportContext(c), filter);
    const locale = await csvLocale(c);
    const { t } = await createServerI18n(locale);
    return c.body(
      visitsCsv(items, site.timeZone, locale, t),
      200,
      csvHeaders(`visits-${filter.from}-${filter.to}.csv`),
    );
  });
