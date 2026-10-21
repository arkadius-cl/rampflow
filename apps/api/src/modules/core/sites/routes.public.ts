import type { HolidayRegions, SiteCountries } from '@rampflow/shared/modules/core/api.sites';
import { ScopeParty, Setting, StoryId, ValidationTarget } from '@rampflow/shared/values';
import { Hono } from 'hono';
import * as z from 'zod';
import { withScope } from '../../../db/scope.ts';
import { loadAccess } from '../../../kernel/access.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
import { holidayRegions } from '../../booking/jobs/holiday-import.ts';

const CountryParam = z.object({ country: z.string().regex(/^[A-Z]{2}$/) });

/** Mounted at `/api/public/countries` by modules/index.ts (MD-01, MD-05, PL-03). */
export const publicApi = new Hono<AppEnv>()
  .get(
    '/',
    op({
      id: 'core.sites.listSiteCountries',
      stories: [StoryId.MD_01, StoryId.PL_03],
      description:
        'The ISO 3166-1 alpha-2 codes the platform admits sites in (`core.site_countries`), for the country select of the site form',
      responses: { 200: type<SiteCountries>() },
    }),
    async (c) => {
      const items = await withScope({ party: ScopeParty.anonymous }, async (tx) => {
        const access = await loadAccess(tx, { party: ScopeParty.anonymous }, c.var.clock);
        return (await access.setting(Setting.core.site_countries, null)).value;
      });
      const body: SiteCountries = { items: [...items] };
      return c.json(body, 200);
    },
  )
  .get(
    '/:country/holiday-regions',
    op({
      id: 'core.sites.listHolidayRegions',
      stories: [StoryId.MD_01, StoryId.MD_05],
      description:
        'The subdivisions of an ISO 3166-1 alpha-2 country that have their own public holidays, for the region select of the site form; empty for a country without any',
      responses: { 200: type<HolidayRegions>() },
    }),
    validate(ValidationTarget.param, CountryParam),
    (c) => {
      const body: HolidayRegions = { items: holidayRegions(c.req.valid('param').country) };
      return c.json(body, 200, { 'Cache-Control': 'public, max-age=86400' });
    },
  );
