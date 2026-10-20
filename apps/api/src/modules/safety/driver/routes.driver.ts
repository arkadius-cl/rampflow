import {
  AcknowledgementBody,
  type AcknowledgementResult,
  AttemptBody,
  type AttemptResult,
  BriefingQuery,
  type DriverBriefingContent,
  type DriverBriefingList,
} from '@rampflow/shared/modules/safety/api.driver';
import { Feature, StoryId } from '@rampflow/shared/values';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requireEntitlement } from '../../../kernel/access.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
import {
  acknowledge,
  briefingContent,
  driverVisit,
  listBriefings,
  submitAttempt,
} from './briefings.ts';
import { deviceHashOf, ensureDevice } from './pass.ts';

const InstructionParam = z.object({ instructionId: idSchema<'safety_instruction'>() });

/** SF-04. Mounted at `/api/driver/briefings` with `withModule('safety')`. */
export const driver = new Hono<AppEnv>()
  .get(
    '/',
    op({
      id: 'safety.driver.listBriefings',
      stories: [StoryId.SF_04],
      description:
        "at `/briefings`; on a `link` session with an `rf_device` cookie it first links this phone's valid passes at the tenant to the booking (`link_acknowledgement` via `pass`) for instructions still missing; then `{ items: [{ instructionId, name, status, expiresAt, quiz, locales }] }`",
      responses: { 200: type<DriverBriefingList>() },
    }),
    async (c) => c.json(await listBriefings(await driverVisit(c), deviceHashOf(c)), 200),
  )
  .get(
    '/:instructionId',
    op({
      id: 'safety.driver.getBriefing',
      stories: [StoryId.SF_04, StoryId.DR_02],
      description:
        "`?locale=`; the published version in that locale, else en, else its first locale; `{ instructionId, version, locale, translation, title, blocks, questions, statement }`; questions without answers, and none while `safety.quiz` is off; 404 for an instruction that does not apply to the booking's site",
      responses: { 200: type<DriverBriefingContent>() },
    }),
    validate('param', InstructionParam),
    validate('query', BriefingQuery),
    async (c) => {
      const { instructionId } = c.req.valid('param');
      const { locale } = c.req.valid('query');
      return c.json(await briefingContent(await driverVisit(c), instructionId, locale), 200);
    },
  )
  .post(
    '/:instructionId/attempts',
    op({
      id: 'safety.driver.createAttempt',
      stories: [StoryId.SF_04, StoryId.SF_02],
      description:
        '`{ locale, answers: { <questionId>: <option index> } }` → `{ score, passed, attempts, wrong }`; passes at `safety.quiz_pass_percent`; counts every attempt in `safety_attempt` per booking and version; the latest attempt decides',
      responses: { 200: type<AttemptResult>() },
    }),
    requireEntitlement(Feature.safety.quiz),
    validate('param', InstructionParam),
    validate('json', AttemptBody),
    async (c) => {
      const { instructionId } = c.req.valid('param');
      return c.json(
        await submitAttempt(await driverVisit(c), instructionId, c.req.valid('json')),
        200,
      );
    },
  )
  .post(
    '/:instructionId/acknowledgement',
    op({
      id: 'safety.driver.acknowledgeBriefing',
      stories: [StoryId.SF_04],
      description:
        "`{ locale, name, confirmed: true }` → 201 `{ expiresAt }`; with a quiz and `safety.quiz` on, 409 `conflict` reason `quiz_not_passed` until the latest attempt passed; stores the acknowledgement through `recordAcknowledgement` with the session's channel, links it (`link_acknowledgement` via `completed`); on a `link` session with an expiry it sets `rf_device` (one year, `Path=/api/driver`) when absent and upserts the `safety_pass`; a `staff` session (gate device, YD-02) never does",
      responses: { 201: type<AcknowledgementResult>() },
    }),
    validate('param', InstructionParam),
    validate('json', AcknowledgementBody),
    async (c) => {
      const { instructionId } = c.req.valid('param');
      const result = await acknowledge(
        await driverVisit(c),
        instructionId,
        c.req.valid('json'),
        () => ensureDevice(c),
      );
      return c.json(result, 201);
    },
  );
