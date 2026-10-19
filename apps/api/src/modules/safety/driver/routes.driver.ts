import { zValidator } from '@hono/zod-validator';
import {
  AcknowledgementBody,
  AttemptBody,
  BriefingQuery,
} from '@rampflow/shared/modules/safety/api.driver';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requireEntitlement } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
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
  .get('/', async (c) => c.json(await listBriefings(await driverVisit(c), deviceHashOf(c)), 200))
  .get(
    '/:instructionId',
    zValidator('param', InstructionParam, onInvalid),
    zValidator('query', BriefingQuery, onInvalid),
    async (c) => {
      const { instructionId } = c.req.valid('param');
      const { locale } = c.req.valid('query');
      return c.json(await briefingContent(await driverVisit(c), instructionId, locale), 200);
    },
  )
  .post(
    '/:instructionId/attempts',
    requireEntitlement('safety.quiz'),
    zValidator('param', InstructionParam, onInvalid),
    zValidator('json', AttemptBody, onInvalid),
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
    zValidator('param', InstructionParam, onInvalid),
    zValidator('json', AcknowledgementBody, onInvalid),
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
