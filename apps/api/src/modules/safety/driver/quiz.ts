import type { Question } from '@rampflow/shared/modules/safety/api.authoring';
import type { AttemptResult } from '@rampflow/shared/modules/safety/api.driver';
import { and, eq, sql } from 'drizzle-orm';
import type { BookingId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { safetyAttempt, type VersionId } from '../schema.ts';

/** SF-02, SF-04: percent correct and the questions to read again. Pure. */
export function scoreAnswers(
  questions: readonly Question[],
  answers: Readonly<Record<string, number>>,
  passPercent: number,
): Omit<AttemptResult, 'attempts'> {
  const wrong = questions.filter((q) => answers[q.id] !== q.correct).map((q) => q.id);
  const total = questions.length;
  const score = total === 0 ? 100 : Math.round(((total - wrong.length) / total) * 100);
  return { score, passed: score >= passPercent, wrong };
}

export interface AttemptKey {
  tenantId: TenantId;
  bookingId: BookingId;
  versionId: VersionId;
}

/** Counts one attempt for the visit and version; the latest attempt decides whether it passed. */
export async function recordAttempt(
  tx: Tx,
  key: AttemptKey,
  result: { score: number; passed: boolean },
  now: Date,
): Promise<number> {
  const passedAt = result.passed ? now : null;
  const [row] = await tx
    .insert(safetyAttempt)
    .values({ ...key, attempts: 1, lastScore: result.score, passedAt })
    .onConflictDoUpdate({
      target: [safetyAttempt.bookingId, safetyAttempt.versionId],
      set: {
        attempts: sql`${safetyAttempt.attempts} + 1`,
        lastScore: result.score,
        passedAt,
      },
    })
    .returning({ attempts: safetyAttempt.attempts });
  if (!row) throw new Error('safety_attempt upsert returned no row');
  return row.attempts;
}

export async function attemptOf(tx: Tx, key: AttemptKey) {
  const [row] = await tx
    .select({
      attempts: safetyAttempt.attempts,
      lastScore: safetyAttempt.lastScore,
      passedAt: safetyAttempt.passedAt,
    })
    .from(safetyAttempt)
    .where(
      and(
        eq(safetyAttempt.bookingId, key.bookingId),
        eq(safetyAttempt.versionId, key.versionId),
        eq(safetyAttempt.tenantId, key.tenantId),
      ),
    );
  return row ?? null;
}
