import type { Block, Question, SafetyLocale } from '@rampflow/shared/modules/safety/api.authoring';
import { materialFloor } from '@rampflow/shared/modules/safety/validity';
import type { TranslationState } from '@rampflow/shared/modules/safety/values';
import { and, eq, exists, inArray, isNull, ne, or } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import {
  type InstructionId,
  safetyContent,
  safetyInstruction,
  safetyInstructionSite,
  safetyVersion,
  type VersionId,
} from '../schema.ts';

// Read side for the gate (U9), the driver PWA (U10) and reports (U11). Every function works in a
// tenant scope and in a driver scope: drivers see published and retired versions, never drafts.

export interface ApplicableInstruction {
  instructionId: InstructionId;
  name: string;
  versionId: VersionId;
  version: number;
  /** Acknowledgements of versions below this are `outdated` (`acknowledgementStatus`). */
  materialFloor: number;
  /** Whether the published version has questions (SF-02). */
  quiz: boolean;
  locales: { locale: SafetyLocale; translation: TranslationState }[];
}

/** Unarchived instructions with a published version that apply to the site (SF-01, SF-04). */
export async function applicableInstructions(
  tx: Tx,
  where: { tenantId: TenantId; siteId: SiteId },
): Promise<ApplicableInstruction[]> {
  const { tenantId, siteId } = where;
  const rows = await tx
    .select({
      instructionId: safetyInstruction.id,
      name: safetyInstruction.name,
      versionId: safetyVersion.id,
      version: safetyVersion.version,
    })
    .from(safetyInstruction)
    .innerJoin(
      safetyVersion,
      and(
        eq(safetyVersion.instructionId, safetyInstruction.id),
        eq(safetyVersion.status, 'published'),
      ),
    )
    .where(
      and(
        eq(safetyInstruction.tenantId, tenantId),
        isNull(safetyInstruction.archivedAt),
        or(
          eq(safetyInstruction.allSites, true),
          exists(
            tx
              .select({ one: safetyInstructionSite.siteId })
              .from(safetyInstructionSite)
              .where(
                and(
                  eq(safetyInstructionSite.instructionId, safetyInstruction.id),
                  eq(safetyInstructionSite.siteId, siteId),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(safetyInstruction.name, safetyInstruction.id);
  if (rows.length === 0) return [];
  const history = await tx
    .select({
      instructionId: safetyVersion.instructionId,
      version: safetyVersion.version,
      status: safetyVersion.status,
      materialChange: safetyVersion.materialChange,
    })
    .from(safetyVersion)
    .where(
      and(
        eq(safetyVersion.tenantId, tenantId),
        inArray(
          safetyVersion.instructionId,
          rows.map((r) => r.instructionId),
        ),
        ne(safetyVersion.status, 'draft'),
      ),
    );
  const content = await tx
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
          rows.map((r) => r.versionId),
        ),
      ),
    );
  return rows.map((r) => {
    const locales = content.filter((c) => c.versionId === r.versionId);
    return {
      ...r,
      materialFloor: materialFloor(history.filter((h) => h.instructionId === r.instructionId)),
      quiz: locales.some((c) => (c.questions as Question[]).length > 0),
      locales: locales.map((c) => ({
        locale: c.locale as SafetyLocale,
        translation: c.translation,
      })),
    };
  });
}

export interface PublishedContent {
  instructionId: InstructionId;
  versionId: VersionId;
  version: number;
  locale: SafetyLocale;
  title: string;
  blocks: Block[];
  /** With the correct answers: strip `correct` before sending them to a driver. */
  questions: Question[];
  statement: string;
  translation: TranslationState;
  contentHash: Buffer;
}

/** One locale of the instruction's published version, or `null` if it has none in that locale. */
export async function publishedContent(
  tx: Tx,
  where: { tenantId: TenantId; instructionId: InstructionId; locale: SafetyLocale },
): Promise<PublishedContent | null> {
  const { tenantId, instructionId, locale } = where;
  const [row] = await tx
    .select({ version: safetyVersion, content: safetyContent })
    .from(safetyVersion)
    .innerJoin(
      safetyContent,
      and(eq(safetyContent.versionId, safetyVersion.id), eq(safetyContent.locale, locale)),
    )
    .where(
      and(
        eq(safetyVersion.tenantId, tenantId),
        eq(safetyVersion.instructionId, instructionId),
        eq(safetyVersion.status, 'published'),
      ),
    );
  if (!row) return null;
  const { version, content } = row;
  return {
    instructionId,
    versionId: version.id,
    version: version.version,
    locale,
    title: content.title,
    blocks: content.blocks as Block[],
    questions: content.questions as Question[],
    statement: content.statement,
    translation: content.translation,
    contentHash: content.contentHash,
  };
}
