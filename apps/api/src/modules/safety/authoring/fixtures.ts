import { ActorParty, LinkVia } from '@rampflow/shared/modules/booking/values';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import type { ContentBody } from '@rampflow/shared/modules/safety/api.authoring';
import {
  BlockKind,
  PictogramId,
  TranslationState,
  VersionStatus,
} from '@rampflow/shared/modules/safety/values';
import { DriverLocale } from '@rampflow/shared/values';
import type { OwnerDb } from '../../../../test/db.ts';
import type { WorldSide } from '../../../../test/world.ts';
import {
  type AcknowledgementId,
  bookingAcknowledgement,
  type InstructionId,
  safetyAcknowledgement,
  safetyContent,
  safetyInstruction,
  safetyVersion,
  type VersionId,
} from '../schema.ts';
import { contentHash } from './content.ts';

// Test fixtures of the safety module, written as the owner like test/world.ts.

export const QUIZ: ContentBody['questions'] = [1, 2, 3].map((n) => ({
  id: `q${n}`,
  prompt: `Question ${n}?`,
  options: ['Yes', 'No'],
  correct: 0,
}));

export const contentFixture = (overrides: Partial<ContentBody> = {}): ContentBody => ({
  title: 'Site rules',
  blocks: [
    { kind: BlockKind.pictogram, id: PictogramId.hi_vis_vest },
    { kind: BlockKind.text, text: 'Wear a vest.' },
  ],
  questions: QUIZ,
  statement: 'I will follow the rules.',
  translation: TranslationState.source,
  ...overrides,
});

export interface BriefingFixture {
  instructionId: InstructionId;
  /** Version 1, published, en only, with three questions. */
  publishedId: VersionId;
  /** Version 2, draft, en only, with three questions. */
  draftId: VersionId;
  /** Of `side.bookings.own`, valid for a year from 2026-11-01, linked to the booking. */
  acknowledgementId: AcknowledgementId;
}

const fixtures = new WeakMap<WorldSide, BriefingFixture>();

/** The fixture `seedBriefing` wrote for this side. */
export function briefingOf(side: WorldSide): BriefingFixture {
  const f = fixtures.get(side);
  if (!f) throw new Error('seedBriefing(side) first');
  return f;
}

export async function seedBriefing(o: OwnerDb, side: WorldSide): Promise<BriefingFixture> {
  const { tenantId } = side;
  const [instruction] = await o
    .insert(safetyInstruction)
    .values({ tenantId, name: 'Site rules', allSites: true })
    .returning({ id: safetyInstruction.id });
  if (!instruction) throw new Error('no instruction');
  const instructionId = instruction.id;
  const publishedAt = new Date(Date.UTC(2026, 9, 1));
  const versions = await o
    .insert(safetyVersion)
    .values([
      { tenantId, instructionId, version: 1, status: VersionStatus.published, publishedAt },
      { tenantId, instructionId, version: 2, status: VersionStatus.draft },
    ])
    .returning({ id: safetyVersion.id, version: safetyVersion.version });
  const publishedId = versions.find((v) => v.version === 1)?.id as VersionId;
  const draftId = versions.find((v) => v.version === 2)?.id as VersionId;
  const body = contentFixture();
  for (const versionId of [publishedId, draftId]) {
    await o.insert(safetyContent).values({
      versionId,
      tenantId,
      locale: DriverLocale.en,
      ...body,
      contentHash: contentHash(body),
    });
  }
  const own = side.bookings.own;
  const completedAt = new Date(Date.UTC(2026, 10, 1, 7, 0));
  const [ack] = await o
    .insert(safetyAcknowledgement)
    .values({
      tenantId,
      instructionId,
      versionId: publishedId,
      locale: DriverLocale.en,
      contentHash: contentHash(body),
      bookingId: own.id,
      carrierId: own.carrierId,
      driverName: `Driver ${own.code}`,
      statementShown: body.statement,
      channel: DriverChannel.link,
      score: 100,
      attempts: 1,
      completedAt,
      expiresAt: new Date(completedAt.getTime() + 365 * 86_400_000),
    })
    .returning({ id: safetyAcknowledgement.id });
  if (!ack) throw new Error('no acknowledgement');
  await o.insert(bookingAcknowledgement).values({
    bookingId: own.id,
    instructionId,
    acknowledgementId: ack.id,
    tenantId,
    siteId: own.siteId,
    via: LinkVia.completed,
    linkedByParty: ActorParty.driver,
  });
  const fixture = { instructionId, publishedId, draftId, acknowledgementId: ack.id };
  fixtures.set(side, fixture);
  return fixture;
}
