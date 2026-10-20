import {
  ContentBody,
  CreateInstructionBody,
  PublishBody,
  SafetyLocale,
  UpdateInstructionBody,
} from '@rampflow/shared/modules/safety/api.authoring';
import { Limit, Permission, StoryId } from '@rampflow/shared/values';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import { op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
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

const manage = requirePermission(Permission.safety.manage_briefings);

/** SF-01, SF-02. Mounted at `/api/t/:orgId/safety` with `withModule('safety')`. */
export const tenant = new Hono<AppEnv>()
  .get(
    '/instructions',
    op({
      id: 'safety.authoring.listInstructions',
      stories: [StoryId.SF_01],
      description: '`{ items }` with sites, archive time, published and draft version',
      responses: {},
    }),
    manage,
    async (c) => {
      const { tenantId } = tenantActor(c);
      return c.json({ items: await listInstructions(c.var.db, tenantId) }, 200);
    },
  )
  .post(
    '/instructions',
    op({
      id: 'safety.authoring.createInstruction',
      stories: [StoryId.SF_01],
      description:
        '`{ name, allSites, siteIds }`; version 1 draft from the 12-language platform template, de and en flagged `source`, the others `machine`; template questions only with `safety.quiz`; a site of another tenant answers 404',
      limits: [Limit.safety.max_briefing_templates],
      responses: {},
    }),
    manage,
    validate('json', CreateInstructionBody),
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
    op({
      id: 'safety.authoring.updateInstruction',
      stories: [StoryId.SF_01],
      description:
        '`{ name?, allSites?, siteIds?, archived? }`; `allSites` and `siteIds` change together; `archived: false` counts against the limit again',
      responses: {},
    }),
    manage,
    validate('param', InstructionParam),
    validate('json', UpdateInstructionBody),
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
    op({
      id: 'safety.authoring.listVersions',
      stories: [StoryId.SF_01],
      description: '`{ items }`, newest first, with locales, translation flags and question counts',
      responses: {},
    }),
    manage,
    validate('param', InstructionParam),
    async (c) => {
      const { tenantId } = tenantActor(c);
      const items = await listVersions(c.var.db, tenantId, c.req.valid('param').instructionId);
      return c.json({ items }, 200);
    },
  )
  .post(
    '/instructions/:instructionId/versions',
    op({
      id: 'safety.authoring.createVersion',
      stories: [StoryId.SF_01],
      description:
        'new draft copied from the latest version (201); the open draft if one exists (200); without `safety.quiz` the copy drops its questions',
      responses: {},
    }),
    manage,
    validate('param', InstructionParam),
    async (c) => {
      const { created, version } = await openDraft(c.var.db, {
        ...tenantActor(c),
        instructionId: c.req.valid('param').instructionId,
      });
      return c.json(version, created ? 201 : 200);
    },
  )
  .get(
    '/versions/:versionId',
    op({
      id: 'safety.authoring.getVersion',
      stories: [StoryId.SF_01],
      description: 'all locales with questions, answers and content hash',
      responses: {},
    }),
    manage,
    validate('param', VersionParam),
    async (c) => {
      const { tenantId } = tenantActor(c);
      return c.json(await getVersion(c.var.db, tenantId, c.req.valid('param').versionId), 200);
    },
  )
  .put(
    '/versions/:versionId/content/:locale',
    op({
      id: 'safety.authoring.putVersionContent',
      stories: [StoryId.SF_01, StoryId.SF_02],
      description:
        'Needs `safety.quiz` when questions are sent. `{ title, blocks, questions, statement, translation }`; draft only, else 409 `invalid_transition` with `status`; at most 5 questions, 2 to 4 options each',
      responses: {},
    }),
    manage,
    validate('param', ContentParam),
    validate('json', ContentBody),
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
    op({
      id: 'safety.authoring.publishVersion',
      stories: [StoryId.SF_01, StoryId.SF_02],
      description:
        '`{ materialChange }`; retires the previous version; with `safety.quiz`, 409 `conflict` reason `quiz_incomplete` with `locales`, `min`, `max` unless every locale has 3 to 5 questions; without it, 403 `entitlement_required` while any locale has questions; repeating it answers 200',
      responses: {},
    }),
    manage,
    validate('param', VersionParam),
    validate('json', PublishBody),
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
