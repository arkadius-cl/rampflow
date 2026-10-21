import { SettingScope } from '@rampflow/shared/values';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import * as z from 'zod';
import { tenantContextQuery } from '@/lib/access';
import { firstTopic, settingsQuery, topicLink } from '@/modules/core/settings-levels';

// `?site=<id>` is the address of the old site tabs: it opens that site's Settings tab, and an id
// that is not a site of this tenant is no access, never the tenant level.

export const Route = createFileRoute('/t/$orgId/settings/')({
  validateSearch: z.object({ site: z.string().optional() }),
  beforeLoad: async ({ context, params, search }) => {
    const { orgId } = params;
    if (search.site !== undefined) {
      const siteId = search.site;
      const tenant = await context.queryClient.ensureQueryData(tenantContextQuery(orgId));
      if (!tenant.sites.some((s) => s.id === siteId)) throw notFound();
      throw redirect({
        to: '/t/$orgId/sites/$siteId/settings',
        params: { orgId, siteId },
        replace: true,
      });
    }
    const level = { scope: SettingScope.tenant, orgId } as const;
    const view = await context.queryClient.ensureQueryData(settingsQuery(level));
    throw redirect({ ...topicLink(level, firstTopic(view)), replace: true });
  },
});
