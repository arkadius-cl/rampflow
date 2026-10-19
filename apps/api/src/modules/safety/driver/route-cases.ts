import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import type { BookingId, TenantId } from '../../../db/ids.ts';
import { briefingOf, QUIZ, seedBriefing } from '../authoring/fixtures.ts';
import { safetyAttempt } from '../schema.ts';

const P = '/api/driver/briefings';

// Instructions apply to every site of their tenant, so the rival carrier's driver at the same
// tenant reads them too: `empty` means 404 for world B and no data of A's own booking.
const base = {
  as: 'driver',
  permission: 'driver',
  entitlement: 'safety.briefings',
  foreign: 'empty',
  siteScoped: false,
  setup: async (w, o) => {
    await seedBriefing(o, w.A);
    await seedBriefing(o, w.B);
  },
} as const satisfies Partial<RouteCase>;

const instruction = (w: World) => ({ instructionId: briefingOf(w.A).instructionId });
const allRight = Object.fromEntries(QUIZ.map((q) => [q.id, q.correct]));

export const cases = defineRouteCases([
  { ...base, method: 'GET', path: P, params: () => ({}) },
  { ...base, method: 'GET', path: `${P}/:instructionId`, params: instruction },
  {
    ...base,
    method: 'POST',
    path: `${P}/:instructionId/attempts`,
    entitlement: 'safety.quiz',
    params: instruction,
    body: () => ({ locale: 'en', answers: allRight }),
  },
  {
    ...base,
    method: 'POST',
    path: `${P}/:instructionId/acknowledgement`,
    params: instruction,
    body: () => ({ locale: 'en', name: 'Dana Driver', confirmed: true }),
    setup: async (w, o) => {
      await base.setup(w, o);
      // Both drivers at tenant A passed the quiz, so the rival's call reaches the handler too.
      await o.insert(safetyAttempt).values(
        [w.A.bookings.own, w.A.bookings.rival].map((b) => ({
          bookingId: b.id as BookingId,
          versionId: briefingOf(w.A).publishedId,
          tenantId: w.A.tenantId as TenantId,
          attempts: 1,
          lastScore: 100,
          passedAt: new Date(),
        })),
      );
    },
  },
]);
