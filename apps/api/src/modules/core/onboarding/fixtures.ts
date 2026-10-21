import { hoursTemplateRows } from '@rampflow/shared/modules/core/api.sites';
import { DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import type { Hono } from 'hono';
import { as } from '../../../../test/http.ts';
import type { WorldUser } from '../../../../test/world.ts';

// Onboarding fixtures: the screens' requests, sent as the tenant admin, one step at a time.

export interface Steps {
  site(name?: string): Promise<string>;
  hall(siteId: string): Promise<string>;
  /** The dock's response, so a test can assert a refused one. */
  dock(siteId: string, hallId: string, code?: string): Promise<Response>;
}

export function onboardingSteps(
  app: Pick<Hono, 'request'>,
  admin: WorldUser,
  tenantId: string,
): Steps {
  const t = `/api/t/${tenantId}`;
  const created = async (res: Response) => {
    if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { id: string }).id;
  };
  return {
    site: async (name = 'Bremerhaven') =>
      created(
        await as(app, admin).post(`${t}/sites`, {
          body: {
            name,
            addressLine1: 'Am Seedeich 40',
            postalCode: '27572',
            city: 'Bremerhaven',
            country: 'DE',
            subdivision: 'DE-HB',
            timeZone: 'Europe/Berlin',
            defaultLocale: 'de',
            hours: hoursTemplateRows.one_shift,
          },
        }),
      ),
    hall: async (siteId) =>
      created(
        await as(app, admin).post(`${t}/sites/${siteId}/halls`, { body: { name: 'Halle 1' } }),
      ),
    dock: (siteId, hallId, code = 'T01') =>
      as(app, admin).post(`${t}/sites/${siteId}/docks`, {
        body: {
          hallId,
          code,
          doorType: DoorType.dock_leveler,
          temperatureZone: TemperatureZone.ambient,
        },
      }),
  };
}
