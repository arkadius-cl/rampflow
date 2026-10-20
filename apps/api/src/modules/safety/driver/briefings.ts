import type { BookingStatus } from '@rampflow/shared/modules/booking/lifecycle';
import { ActorParty, LinkVia } from '@rampflow/shared/modules/booking/values';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import type { SafetyLocale } from '@rampflow/shared/modules/safety/api.authoring';
import type {
  AcknowledgementBody,
  AcknowledgementResult,
  AttemptBody,
  AttemptResult,
  DriverBriefingContent,
  DriverBriefingList,
} from '@rampflow/shared/modules/safety/api.driver';
import { InstructionSafety } from '@rampflow/shared/modules/safety/values';
import { ConflictReason, DriverLocale, ErrorCode, Setting } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { BookingId, CarrierId, SiteId, TenantId, TokenHash } from '../../../db/ids.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { type BookingContext, bookingContext } from '../../booking/lifecycle/context.ts';
import { transitionBooking } from '../../booking/lifecycle/transition.ts';
import { booking } from '../../booking/schema.ts';
import {
  type ApplicableInstruction,
  applicableInstructions,
  type PublishedContent,
  publishedContent,
} from '../authoring/published.ts';
import { recordAcknowledgement, validityDays } from '../register/acknowledgements.ts';
import type { InstructionId } from '../schema.ts';
import { attemptOf, recordAttempt, scoreAnswers } from './quiz.ts';
import { driverSafety, keepPass, redeemPasses } from './safety_pass.redeem.ts';

// SF-04 for the driver PWA and the gate device (YD-02): read the briefing, answer the quiz,
// acknowledge. Every function acts on the one booking of the driver session.

export interface DriverVisit {
  ctx: BookingContext;
  channel: DriverChannel;
  booking: {
    id: BookingId;
    tenantId: TenantId;
    siteId: SiteId;
    carrierId: CarrierId | null;
    status: BookingStatus;
  };
}

export async function driverVisit(c: Context<AppEnv>): Promise<DriverVisit> {
  const { scope } = c.var;
  if (scope.party !== ActorParty.driver) throw new ApiError(ErrorCode.unauthorized);
  const ctx = bookingContext(c);
  const [row] = await ctx.tx
    .select({
      id: booking.id,
      tenantId: booking.tenantId,
      siteId: booking.siteId,
      carrierId: booking.carrierId,
      status: booking.status,
    })
    .from(booking)
    .where(and(eq(booking.id, scope.bookingId), eq(booking.tenantId, scope.tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  return { ctx, channel: scope.channel, booking: row };
}

const quizOn = (v: DriverVisit) => v.ctx.access.entitlements?.features['safety.quiz'] === true;

/**
 * Redeems this phone's passes first (never on a gate device, whose next driver starts fresh),
 * then lists the instructions of the visit's site with their status.
 */
export async function listBriefings(
  v: DriverVisit,
  device: TokenHash | null,
): Promise<DriverBriefingList> {
  if (device && v.channel === DriverChannel.link) await redeemPasses(v.ctx, v.booking, device);
  const { tx, access, now } = v.ctx;
  const applicable = await applicableInstructions(tx, v.booking);
  const safety = await driverSafety(tx, access, v.booking, now);
  return {
    items: applicable.map((i) => {
      const s = safety.instructions.find((x) => x.instructionId === i.instructionId);
      return {
        instructionId: i.instructionId,
        name: i.name,
        status: s?.status ?? InstructionSafety.missing,
        expiresAt: s?.expiresAt ?? null,
        quiz: i.quiz && quizOn(v),
        locales: i.locales,
      };
    }),
  };
}

async function applicable(v: DriverVisit, instructionId: InstructionId) {
  const found = (await applicableInstructions(v.ctx.tx, v.booking)).find(
    (i) => i.instructionId === instructionId,
  );
  if (!found) throw new ApiError(ErrorCode.not_found);
  return found;
}

async function contentIn(
  v: DriverVisit,
  instructionId: InstructionId,
  locale: SafetyLocale,
): Promise<PublishedContent> {
  const content = await publishedContent(v.ctx.tx, {
    tenantId: v.booking.tenantId,
    instructionId,
    locale,
  });
  if (!content) throw new ApiError(ErrorCode.not_found, 'No published content in this locale');
  return content;
}

/** The requested locale when the version has it, else en, else its first locale (DR-02). */
const bestLocale = (i: ApplicableInstruction, wanted: SafetyLocale | undefined): SafetyLocale => {
  const has = (l: SafetyLocale | undefined) =>
    l !== undefined && i.locales.some((x) => x.locale === l);
  if (has(wanted)) return wanted as SafetyLocale;
  if (has(DriverLocale.en)) return DriverLocale.en;
  const first = i.locales[0];
  if (!first) throw new ApiError(ErrorCode.not_found, 'The briefing has no content');
  return first.locale;
};

export async function briefingContent(
  v: DriverVisit,
  instructionId: InstructionId,
  wanted: SafetyLocale | undefined,
): Promise<DriverBriefingContent> {
  const instruction = await applicable(v, instructionId);
  const content = await contentIn(v, instructionId, bestLocale(instruction, wanted));
  return {
    instructionId,
    version: content.version,
    locale: content.locale,
    translation: content.translation,
    title: content.title,
    blocks: content.blocks,
    questions: quizOn(v)
      ? content.questions.map(({ id, prompt, options }) => ({ id, prompt, options }))
      : [],
    statement: content.statement,
  };
}

const attemptKey = (v: DriverVisit, content: PublishedContent) => ({
  tenantId: v.booking.tenantId,
  bookingId: v.booking.id,
  versionId: content.versionId,
});

/** SF-02, SF-04: scores the answers against the published version and counts the attempt. */
export async function submitAttempt(
  v: DriverVisit,
  instructionId: InstructionId,
  body: AttemptBody,
): Promise<AttemptResult> {
  await applicable(v, instructionId);
  const content = await contentIn(v, instructionId, body.locale);
  if (content.questions.length === 0)
    throw new ApiError(ErrorCode.not_found, 'The briefing has no quiz');
  const passPercent = (
    await v.ctx.access.setting(Setting.safety.quiz_pass_percent, v.booking.siteId)
  ).value;
  const result = scoreAnswers(content.questions, body.answers, passPercent);
  const attempts = await recordAttempt(v.ctx.tx, attemptKey(v, content), result, v.ctx.now);
  return { ...result, attempts };
}

/**
 * SF-04: stores the acknowledgement with the statement shown, links it to the visit through the
 * lifecycle and, on the driver's own phone, keeps it as a pass for the tenant's next visit.
 */
export async function acknowledge(
  v: DriverVisit,
  instructionId: InstructionId,
  body: AcknowledgementBody,
  device: () => TokenHash,
): Promise<AcknowledgementResult> {
  const { tx, access, now } = v.ctx;
  await applicable(v, instructionId);
  const content = await contentIn(v, instructionId, body.locale);
  const attempt = await attemptOf(tx, attemptKey(v, content));
  const quiz = content.questions.length > 0 && quizOn(v);
  if (quiz && !attempt?.passedAt) {
    throw new ApiError(ErrorCode.conflict, 'Conflict: quiz_not_passed', {
      reason: ConflictReason.quiz_not_passed,
    });
  }
  const ack = await recordAcknowledgement(tx, {
    tenantId: v.booking.tenantId,
    bookingId: v.booking.id,
    carrierId: v.booking.carrierId,
    instructionId,
    locale: body.locale,
    driverName: body.name,
    channel: v.channel,
    score: quiz ? (attempt?.lastScore ?? null) : null,
    attempts: quiz ? (attempt?.attempts ?? 1) : 1,
    completedAt: now,
    validityDays: await validityDays(access, v.booking.siteId),
  });
  await transitionBooking(v.ctx, v.booking.id, {
    type: 'link_acknowledgement',
    acknowledgementId: ack.id,
    via: LinkVia.completed,
  });
  if (v.channel === DriverChannel.link && ack.expiresAt) {
    await keepPass(tx, {
      deviceHash: device(),
      tenantId: v.booking.tenantId,
      instructionId,
      acknowledgementId: ack.id,
      expiresAt: ack.expiresAt,
    });
  }
  return { expiresAt: ack.expiresAt?.toISOString() ?? null };
}
