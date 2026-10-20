import type { Entitlements } from '@rampflow/shared';
import {
  type Block,
  type Content,
  type ContentBody,
  type CreateInstructionBody,
  type Instruction,
  QUIZ_QUESTIONS,
  type Question,
  type SafetyLocale,
  type UpdateInstructionBody,
  type VersionDetail,
  type VersionSummary,
} from '@rampflow/shared/modules/safety/api.authoring';
import { VersionStatus } from '@rampflow/shared/modules/safety/values';
import {
  ConflictReason,
  DriverLocale,
  ErrorCode,
  Feature,
  Limit,
  values,
} from '@rampflow/shared/values';
import { and, asc, count, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { SiteId, TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { withinLimit } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { site } from '../../core/schema.ts';
import {
  type InstructionId,
  safetyContent,
  safetyInstruction,
  safetyInstructionSite,
  safetyVersion,
  type VersionId,
} from '../schema.ts';
import { templateContent } from '../template/platform.ts';
import { contentHash } from './content.ts';

type ContentRow = typeof safetyContent.$inferSelect;
type VersionRow = typeof safetyVersion.$inferSelect;

const LOCALE_ORDER = new Map<string, number>(values(DriverLocale).map((l, i) => [l, i]));
const byLocale = (a: { locale: string }, b: { locale: string }) =>
  (LOCALE_ORDER.get(a.locale) ?? 99) - (LOCALE_ORDER.get(b.locale) ?? 99);

const quizOn = (entitlements: Entitlements) => entitlements.features[Feature.safety.quiz] === true;

const invalidTransition = (status: VersionStatus) =>
  new ApiError(ErrorCode.conflict, `Version is ${status}`, {
    reason: ConflictReason.invalid_transition,
    status,
  });

const quizRequired = () =>
  new ApiError(ErrorCode.entitlement_required, 'safety.quiz is off', { key: 'safety.quiz' });

function contentRow(
  tenantId: TenantId,
  versionId: VersionId,
  locale: SafetyLocale,
  body: ContentBody,
): typeof safetyContent.$inferInsert {
  return { tenantId, versionId, locale, ...body, contentHash: contentHash(body) };
}

function toContent(row: ContentRow): Content {
  return {
    locale: row.locale as SafetyLocale,
    title: row.title,
    blocks: row.blocks as Block[],
    questions: row.questions as Question[],
    statement: row.statement,
    translation: row.translation,
    contentHash: row.contentHash.toString('hex'),
  };
}

const unarchivedCount = (tenantId: TenantId) => async (tx: Tx) =>
  (
    await tx
      .select({ n: count() })
      .from(safetyInstruction)
      .where(and(eq(safetyInstruction.tenantId, tenantId), isNull(safetyInstruction.archivedAt)))
  )[0]?.n ?? 0;

/** 404 unless every id is a site of the tenant, so a foreign site id reveals nothing. */
async function assertOwnSites(tx: Tx, tenantId: TenantId, siteIds: readonly string[]) {
  if (siteIds.length === 0) return;
  const unique = [...new Set(siteIds)] as SiteId[];
  const found = await tx
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.tenantId, tenantId), inArray(site.id, unique)));
  if (found.length !== unique.length) throw new ApiError(ErrorCode.not_found, 'Unknown site');
}

async function replaceSites(
  tx: Tx,
  tenantId: TenantId,
  instructionId: InstructionId,
  siteIds: readonly string[],
) {
  await tx
    .delete(safetyInstructionSite)
    .where(
      and(
        eq(safetyInstructionSite.tenantId, tenantId),
        eq(safetyInstructionSite.instructionId, instructionId),
      ),
    );
  const unique = [...new Set(siteIds)] as SiteId[];
  if (unique.length > 0) {
    await tx
      .insert(safetyInstructionSite)
      .values(unique.map((siteId) => ({ tenantId, instructionId, siteId })));
  }
}

export async function listInstructions(
  tx: Tx,
  tenantId: TenantId,
  only?: InstructionId,
): Promise<Instruction[]> {
  const instructions = await tx
    .select()
    .from(safetyInstruction)
    .where(
      and(
        eq(safetyInstruction.tenantId, tenantId),
        only ? eq(safetyInstruction.id, only) : undefined,
      ),
    )
    .orderBy(asc(safetyInstruction.name), asc(safetyInstruction.id));
  if (instructions.length === 0) return [];
  const ids = instructions.map((i) => i.id);
  const sites = await tx
    .select()
    .from(safetyInstructionSite)
    .where(
      and(
        eq(safetyInstructionSite.tenantId, tenantId),
        inArray(safetyInstructionSite.instructionId, ids),
      ),
    );
  const versions = await tx
    .select()
    .from(safetyVersion)
    .where(
      and(
        eq(safetyVersion.tenantId, tenantId),
        inArray(safetyVersion.instructionId, ids),
        ne(safetyVersion.status, 'retired'),
      ),
    );
  return instructions.map((i) => {
    const published = versions.find(
      (v) => v.instructionId === i.id && v.status === VersionStatus.published,
    );
    const draft = versions.find(
      (v) => v.instructionId === i.id && v.status === VersionStatus.draft,
    );
    return {
      id: i.id,
      name: i.name,
      allSites: i.allSites,
      siteIds: sites.filter((s) => s.instructionId === i.id).map((s) => s.siteId),
      archivedAt: i.archivedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      published: published?.publishedAt
        ? {
            id: published.id,
            version: published.version,
            publishedAt: published.publishedAt.toISOString(),
          }
        : null,
      draft: draft ? { id: draft.id, version: draft.version } : null,
    };
  });
}

async function getInstruction(tx: Tx, tenantId: TenantId, id: InstructionId) {
  const [found] = await listInstructions(tx, tenantId, id);
  if (!found) throw new ApiError(ErrorCode.not_found);
  return found;
}

/** SF-01: version 1 is a draft of the 12-language platform template. */
export async function createInstruction(
  tx: Tx,
  input: { tenantId: TenantId; entitlements: Entitlements; body: CreateInstructionBody },
): Promise<Instruction> {
  const { tenantId, entitlements, body } = input;
  await withinLimit(
    tx,
    tenantId,
    entitlements,
    Limit.safety.max_briefing_templates,
    unarchivedCount(tenantId),
  );
  await assertOwnSites(tx, tenantId, body.siteIds);
  const [created] = await tx
    .insert(safetyInstruction)
    .values({ tenantId, name: body.name, allSites: body.allSites })
    .returning({ id: safetyInstruction.id });
  if (!created) throw new Error('safety_instruction insert returned no row');
  await replaceSites(tx, tenantId, created.id, body.siteIds);
  const [version] = await tx
    .insert(safetyVersion)
    .values({ tenantId, instructionId: created.id, version: 1, status: VersionStatus.draft })
    .returning({ id: safetyVersion.id });
  if (!version) throw new Error('safety_version insert returned no row');
  const quiz = quizOn(entitlements);
  await tx
    .insert(safetyContent)
    .values(
      values(DriverLocale).map((locale) =>
        contentRow(tenantId, version.id, locale, templateContent(locale, { quiz })),
      ),
    );
  return getInstruction(tx, tenantId, created.id);
}

async function lockInstruction(tx: Tx, tenantId: TenantId, id: InstructionId) {
  const [row] = await tx
    .select()
    .from(safetyInstruction)
    .where(and(eq(safetyInstruction.tenantId, tenantId), eq(safetyInstruction.id, id)))
    .for('update');
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

/** Name, sites, archive. Restoring an archived instruction counts against the limit again. */
export async function updateInstruction(
  tx: Tx,
  input: {
    tenantId: TenantId;
    entitlements: Entitlements;
    instructionId: InstructionId;
    body: UpdateInstructionBody;
    now: Date;
  },
): Promise<Instruction> {
  const { tenantId, entitlements, instructionId, body, now } = input;
  const current = await lockInstruction(tx, tenantId, instructionId);
  const patch: Partial<typeof safetyInstruction.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.archived === true && current.archivedAt === null) patch.archivedAt = now;
  if (body.archived === false && current.archivedAt !== null) {
    await withinLimit(
      tx,
      tenantId,
      entitlements,
      Limit.safety.max_briefing_templates,
      unarchivedCount(tenantId),
    );
    patch.archivedAt = null;
  }
  if (body.allSites !== undefined) {
    const siteIds = body.siteIds ?? [];
    await assertOwnSites(tx, tenantId, siteIds);
    patch.allSites = body.allSites;
    await replaceSites(tx, tenantId, instructionId, siteIds);
  }
  if (Object.keys(patch).length > 0) {
    await tx
      .update(safetyInstruction)
      .set(patch)
      .where(
        and(eq(safetyInstruction.tenantId, tenantId), eq(safetyInstruction.id, instructionId)),
      );
  }
  return getInstruction(tx, tenantId, instructionId);
}

async function summaries(tx: Tx, tenantId: TenantId, versions: VersionRow[]) {
  if (versions.length === 0) return [];
  const locales = await tx
    .select({
      versionId: safetyContent.versionId,
      locale: safetyContent.locale,
      translation: safetyContent.translation,
      questions: safetyContent.questions,
    })
    .from(safetyContent)
    .where(
      and(
        eq(safetyContent.tenantId, tenantId),
        inArray(
          safetyContent.versionId,
          versions.map((v) => v.id),
        ),
      ),
    );
  return versions.map(
    (v): VersionSummary => ({
      id: v.id,
      instructionId: v.instructionId,
      version: v.version,
      status: v.status,
      materialChange: v.materialChange,
      publishedAt: v.publishedAt?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
      locales: locales
        .filter((l) => l.versionId === v.id)
        .sort(byLocale)
        .map((l) => ({
          locale: l.locale as SafetyLocale,
          translation: l.translation,
          questions: (l.questions as Question[]).length,
        })),
    }),
  );
}

export async function listVersions(
  tx: Tx,
  tenantId: TenantId,
  instructionId: InstructionId,
): Promise<VersionSummary[]> {
  await getInstruction(tx, tenantId, instructionId);
  const versions = await tx
    .select()
    .from(safetyVersion)
    .where(
      and(eq(safetyVersion.tenantId, tenantId), eq(safetyVersion.instructionId, instructionId)),
    )
    .orderBy(desc(safetyVersion.version));
  return summaries(tx, tenantId, versions);
}

export async function getVersion(
  tx: Tx,
  tenantId: TenantId,
  versionId: VersionId,
): Promise<VersionDetail> {
  const [row] = await tx
    .select({ version: safetyVersion, instructionName: safetyInstruction.name })
    .from(safetyVersion)
    .innerJoin(safetyInstruction, eq(safetyInstruction.id, safetyVersion.instructionId))
    .where(and(eq(safetyVersion.tenantId, tenantId), eq(safetyVersion.id, versionId)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  const [summary] = await summaries(tx, tenantId, [row.version]);
  const content = await tx
    .select()
    .from(safetyContent)
    .where(and(eq(safetyContent.tenantId, tenantId), eq(safetyContent.versionId, versionId)));
  return {
    ...(summary as VersionSummary),
    instructionName: row.instructionName,
    content: content.sort(byLocale).map(toContent),
  };
}

/**
 * "Edit" on a published instruction: the open draft if there is one (200), else a new draft
 * copied from the latest version (201). Without `safety.quiz` the copy drops its questions.
 */
export async function openDraft(
  tx: Tx,
  input: { tenantId: TenantId; entitlements: Entitlements; instructionId: InstructionId },
): Promise<{ created: boolean; version: VersionDetail }> {
  const { tenantId, entitlements, instructionId } = input;
  await lockInstruction(tx, tenantId, instructionId);
  const versions = await tx
    .select()
    .from(safetyVersion)
    .where(
      and(eq(safetyVersion.tenantId, tenantId), eq(safetyVersion.instructionId, instructionId)),
    )
    .orderBy(desc(safetyVersion.version));
  const draft = versions.find((v) => v.status === VersionStatus.draft);
  if (draft) return { created: false, version: await getVersion(tx, tenantId, draft.id) };
  const latest = versions[0];
  if (!latest) throw new Error(`instruction ${instructionId} has no version`);
  const [next] = await tx
    .insert(safetyVersion)
    .values({ tenantId, instructionId, version: latest.version + 1, status: VersionStatus.draft })
    .returning({ id: safetyVersion.id });
  if (!next) throw new Error('safety_version insert returned no row');
  const source = await tx
    .select()
    .from(safetyContent)
    .where(and(eq(safetyContent.tenantId, tenantId), eq(safetyContent.versionId, latest.id)));
  const quiz = quizOn(entitlements);
  if (source.length > 0) {
    await tx.insert(safetyContent).values(
      source.map((row) => {
        const { locale, translation, ...body } = toContent(row);
        return contentRow(tenantId, next.id, locale, {
          ...body,
          questions: quiz ? body.questions : [],
          translation,
        });
      }),
    );
  }
  return { created: true, version: await getVersion(tx, tenantId, next.id) };
}

async function lockVersion(tx: Tx, tenantId: TenantId, versionId: VersionId) {
  const [row] = await tx
    .select()
    .from(safetyVersion)
    .where(and(eq(safetyVersion.tenantId, tenantId), eq(safetyVersion.id, versionId)))
    .for('update');
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

/** SF-01, SF-02: only a draft takes content; questions need `safety.quiz`. */
export async function putContent(
  tx: Tx,
  input: {
    tenantId: TenantId;
    entitlements: Entitlements;
    versionId: VersionId;
    locale: SafetyLocale;
    body: ContentBody;
  },
): Promise<Content> {
  const { tenantId, entitlements, versionId, locale, body } = input;
  if (body.questions.length > 0 && !quizOn(entitlements)) throw quizRequired();
  const version = await lockVersion(tx, tenantId, versionId);
  if (version.status !== VersionStatus.draft) throw invalidTransition(version.status);
  const row = contentRow(tenantId, versionId, locale, body);
  const [saved] = await tx
    .insert(safetyContent)
    .values(row)
    .onConflictDoUpdate({
      target: [safetyContent.versionId, safetyContent.locale],
      set: {
        title: row.title,
        blocks: row.blocks,
        questions: row.questions,
        statement: row.statement,
        translation: row.translation,
        contentHash: row.contentHash,
      },
    })
    .returning();
  if (!saved) throw new Error('safety_content upsert returned no row');
  return toContent(saved);
}

/**
 * SF-01: the draft becomes the published version and the previous one retires. With
 * `safety.quiz` every locale needs 3 to 5 questions (SF-02); without it, none. Publishing the
 * same version again with the same flag is a no-op.
 */
export async function publishVersion(
  tx: Tx,
  input: {
    tenantId: TenantId;
    entitlements: Entitlements;
    versionId: VersionId;
    materialChange: boolean;
    userId: UserId | null;
    now: Date;
  },
): Promise<VersionDetail> {
  const { tenantId, entitlements, versionId, materialChange, userId, now } = input;
  const version = await lockVersion(tx, tenantId, versionId);
  if (version.status === VersionStatus.published && version.materialChange === materialChange) {
    return getVersion(tx, tenantId, versionId);
  }
  if (version.status !== VersionStatus.draft) throw invalidTransition(version.status);
  const content = await tx
    .select({ locale: safetyContent.locale, questions: safetyContent.questions })
    .from(safetyContent)
    .where(and(eq(safetyContent.tenantId, tenantId), eq(safetyContent.versionId, versionId)));
  const counts = content.map((c) => ({
    locale: c.locale,
    n: (c.questions as Question[]).length,
  }));
  if (quizOn(entitlements)) {
    const incomplete = counts
      .filter(({ n }) => n < QUIZ_QUESTIONS.min || n > QUIZ_QUESTIONS.max)
      .map(({ locale }) => locale);
    if (incomplete.length > 0) {
      throw new ApiError(ErrorCode.conflict, 'Every locale needs 3 to 5 questions', {
        reason: ConflictReason.quiz_incomplete,
        locales: incomplete,
        ...QUIZ_QUESTIONS,
      });
    }
  } else if (counts.some(({ n }) => n > 0)) {
    throw quizRequired();
  }
  await tx
    .update(safetyVersion)
    .set({ status: VersionStatus.retired })
    .where(
      and(
        eq(safetyVersion.tenantId, tenantId),
        eq(safetyVersion.instructionId, version.instructionId),
        eq(safetyVersion.status, 'published'),
      ),
    );
  await tx
    .update(safetyVersion)
    .set({ status: VersionStatus.published, materialChange, publishedAt: now, publishedBy: userId })
    .where(and(eq(safetyVersion.tenantId, tenantId), eq(safetyVersion.id, versionId)));
  return getVersion(tx, tenantId, versionId);
}
