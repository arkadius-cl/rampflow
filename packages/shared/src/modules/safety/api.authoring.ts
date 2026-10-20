import * as z from 'zod';
import { values } from '../../values/define.ts';
import { DriverLocale } from '../../values/locales.ts';
import { BlockKind, PictogramId, TranslationState, VersionStatus } from './values.ts';

export { PictogramId, TranslationState, VersionStatus };
export const PICTOGRAM_IDS = values(PictogramId);
export const VERSION_STATUSES = values(VersionStatus);
export const TRANSLATION_STATES = values(TranslationState);

/** Briefing content exists in the driver languages. */
export const SafetyLocale = z.enum(DriverLocale);
export type SafetyLocale = z.infer<typeof SafetyLocale>;

/** With `safety.quiz`, every published locale has this many questions (SF-02). */
export const QUIZ_QUESTIONS = { min: 3, max: 5 } as const;

export const Block = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(BlockKind.text), text: z.string().trim().min(1).max(2000) }),
  z.object({ kind: z.literal(BlockKind.pictogram), id: z.enum(PictogramId) }),
]);
export type Block = z.infer<typeof Block>;

export const Question = z
  .object({
    id: z.string().min(1).max(64),
    prompt: z.string().trim().min(1).max(300),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(4),
    correct: z.int().min(0),
  })
  .refine((q) => q.correct < q.options.length, {
    path: ['correct'],
    message: 'correct must point at an option',
  });
export type Question = z.infer<typeof Question>;

const uniqueIds = (questions: readonly Question[]) =>
  new Set(questions.map((q) => q.id)).size === questions.length;

/** The authored part of one locale; `contentHash` covers these fields except `translation`. */
export const ContentBody = z.object({
  title: z.string().trim().min(1).max(200),
  blocks: z.array(Block).min(1).max(40),
  questions: z
    .array(Question)
    .max(QUIZ_QUESTIONS.max)
    .refine(uniqueIds, 'question ids must be unique')
    .default([]),
  statement: z.string().trim().min(1).max(1000),
  translation: z.enum(TranslationState),
});
export type ContentBody = z.infer<typeof ContentBody>;

const siteRule = (b: { allSites?: boolean; siteIds?: readonly string[] }) =>
  b.allSites === undefined
    ? b.siteIds === undefined
    : b.allSites
      ? (b.siteIds ?? []).length === 0
      : (b.siteIds ?? []).length > 0;
const SITE_RULE = {
  path: ['siteIds'],
  message: 'name sites only when allSites is false, and at least one then',
};

export const InstructionName = z.string().trim().min(1).max(120);
const SiteIds = z.array(z.uuid()).max(500);

export const CreateInstructionBody = z
  .object({ name: InstructionName, allSites: z.boolean(), siteIds: SiteIds.default([]) })
  .refine(siteRule, SITE_RULE);
export type CreateInstructionBody = z.infer<typeof CreateInstructionBody>;

/** `allSites` and `siteIds` change together; `archived: false` restores an instruction. */
export const UpdateInstructionBody = z
  .object({
    name: InstructionName.optional(),
    allSites: z.boolean().optional(),
    siteIds: SiteIds.optional(),
    archived: z.boolean().optional(),
  })
  .refine(siteRule, SITE_RULE);
export type UpdateInstructionBody = z.infer<typeof UpdateInstructionBody>;

export const PublishBody = z.object({ materialChange: z.boolean() });
export type PublishBody = z.infer<typeof PublishBody>;

const VersionRef = z.object({ id: z.uuid(), version: z.int(), publishedAt: z.iso.datetime() });

export const Instruction = z.object({
  id: z.uuid(),
  name: z.string(),
  allSites: z.boolean(),
  siteIds: z.array(z.uuid()),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  published: VersionRef.nullable(),
  draft: z.object({ id: z.uuid(), version: z.int() }).nullable(),
});
export type Instruction = z.infer<typeof Instruction>;

export const LocaleState = z.object({
  locale: SafetyLocale,
  translation: z.enum(TranslationState),
  questions: z.int(),
});

export const VersionSummary = z.object({
  id: z.uuid(),
  instructionId: z.uuid(),
  version: z.int(),
  status: z.enum(VersionStatus),
  materialChange: z.boolean(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  locales: z.array(LocaleState),
});
export type VersionSummary = z.infer<typeof VersionSummary>;

export const Content = ContentBody.extend({
  locale: SafetyLocale,
  questions: z.array(Question),
  /** Hex sha256 of the canonical JSON of title, blocks, questions and statement. */
  contentHash: z.string(),
});
export type Content = z.infer<typeof Content>;

export const VersionDetail = VersionSummary.extend({
  instructionName: z.string(),
  content: z.array(Content),
});
export type VersionDetail = z.infer<typeof VersionDetail>;
