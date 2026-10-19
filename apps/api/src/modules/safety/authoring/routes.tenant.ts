import { zValidator } from '@hono/zod-validator';
import {
  ContentBody,
  CreateInstructionBody,
  PublishBody,
  SafetyLocale,
  UpdateInstructionBody,
} from '@rampflow/shared/modules/safety/api.authoring';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { tenantActor } from './actor.ts';
import {
  createInstruction,
  getVersion,
  listInstructions,
  listVersions,
  openDraft,
  publishVersion,
  putContent,
  updateInstruction,
} from './instructions.ts';

const InstructionParam = z.object({ instructionId: idSchema<'safety_instruction'>() });
const VersionParam = z.object({ versionId: idSchema<'safety_version'>() });
const ContentParam = VersionParam.extend({ locale: SafetyLocale });

const manage = requirePermission('safety.manage_briefings');

/** SF-01, SF-02. Mounted at `/api/t/:orgId/safety` with `withModule('safety')`. */
export const tenant = new Hono<AppEnv>()
  .get('/instructions', manage, async (c) => {
    const { tenantId } = tenantActor(c);
    return c.json({ items: await listInstructions(c.var.db, tenantId) }, 200);
  })
  .post(
    '/instructions',
    manage,
    zValidator('json', CreateInstructionBody, onInvalid),
    async (c) => {
      const instruction = await createInstruction(c.var.db, {
        ...tenantActor(c),
        body: c.req.valid('json'),
      });
      return c.json(instruction, 201);
    },
  )
  .patch(
    '/instructions/:instructionId',
    manage,
    zValidator('param', InstructionParam, onInvalid),
    zValidator('json', UpdateInstructionBody, onInvalid),
    async (c) => {
      const instruction = await updateInstruction(c.var.db, {
        ...tenantActor(c),
        instructionId: c.req.valid('param').instructionId,
        body: c.req.valid('json'),
        now: c.var.clock.now(),
      });
      return c.json(instruction, 200);
    },
  )
  .get(
    '/instructions/:instructionId/versions',
    manage,
    zValidator('param', InstructionParam, onInvalid),
    async (c) => {
      const { tenantId } = tenantActor(c);
      const items = await listVersions(c.var.db, tenantId, c.req.valid('param').instructionId);
      return c.json({ items }, 200);
    },
  )
  .post(
    '/instructions/:instructionId/versions',
    manage,
    zValidator('param', InstructionParam, onInvalid),
    async (c) => {
      const { created, version } = await openDraft(c.var.db, {
        ...tenantActor(c),
        instructionId: c.req.valid('param').instructionId,
      });
      return c.json(version, created ? 201 : 200);
    },
  )
  .get('/versions/:versionId', manage, zValidator('param', VersionParam, onInvalid), async (c) => {
    const { tenantId } = tenantActor(c);
    return c.json(await getVersion(c.var.db, tenantId, c.req.valid('param').versionId), 200);
  })
  .put(
    '/versions/:versionId/content/:locale',
    manage,
    zValidator('param', ContentParam, onInvalid),
    zValidator('json', ContentBody, onInvalid),
    async (c) => {
      const { versionId, locale } = c.req.valid('param');
      const content = await putContent(c.var.db, {
        ...tenantActor(c),
        versionId,
        locale,
        body: c.req.valid('json'),
      });
      return c.json(content, 200);
    },
  )
  .post(
    '/versions/:versionId/publish',
    manage,
    zValidator('param', VersionParam, onInvalid),
    zValidator('json', PublishBody, onInvalid),
    async (c) => {
      const version = await publishVersion(c.var.db, {
        ...tenantActor(c),
        versionId: c.req.valid('param').versionId,
        materialChange: c.req.valid('json').materialChange,
        now: c.var.clock.now(),
      });
      return c.json(version, 200);
    },
  );
