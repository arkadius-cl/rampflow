import * as z from 'zod';
import { type Block, SafetyLocale, type TranslationState } from './api.authoring.ts';

// The briefing routes of the driver PWA (SF-04, ADR-0008). Questions go out without answers.

export interface DriverBriefing {
  instructionId: string;
  name: string;
  status: 'valid' | 'missing';
  expiresAt: string | null;
  /** The driver answers the questions before acknowledging. */
  quiz: boolean;
  locales: { locale: SafetyLocale; translation: TranslationState }[];
}

export interface DriverBriefingList {
  items: DriverBriefing[];
}

export const BriefingQuery = z.object({ locale: SafetyLocale.optional() });

export interface DriverQuestion {
  id: string;
  prompt: string;
  options: string[];
}

/** One locale of the published version: the requested one, else en, else the first. */
export interface DriverBriefingContent {
  instructionId: string;
  version: number;
  locale: SafetyLocale;
  translation: TranslationState;
  title: string;
  blocks: Block[];
  /** Empty when the briefing has no quiz or `safety.quiz` is off. */
  questions: DriverQuestion[];
  statement: string;
}

export const AttemptBody = z.object({
  locale: SafetyLocale,
  answers: z.record(z.string().min(1).max(64), z.int().min(0).max(3)),
});
export type AttemptBody = z.infer<typeof AttemptBody>;

export interface AttemptResult {
  /** Percent correct. */
  score: number;
  passed: boolean;
  /** Attempts for this booking and version so far. */
  attempts: number;
  /** Question ids answered wrong or not at all. */
  wrong: string[];
}

export const AcknowledgementBody = z.object({
  locale: SafetyLocale,
  name: z.string().trim().min(2).max(120),
  confirmed: z.literal(true),
});
export type AcknowledgementBody = z.infer<typeof AcknowledgementBody>;

export interface AcknowledgementResult {
  expiresAt: string | null;
}
