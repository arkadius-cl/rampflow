import type { ValueOf } from '../../values/define.ts';

/** Bundled pictograms; each id has `src/assets/pictograms/<id>.svg`. */
export const PictogramId = {
  hi_vis_vest: 'hi_vis_vest',
  safety_shoes: 'safety_shoes',
  speed_limit_10: 'speed_limit_10',
  forklift_traffic: 'forklift_traffic',
  wheel_chock: 'wheel_chock',
  no_smoking: 'no_smoking',
  no_phone: 'no_phone',
  assembly_point: 'assembly_point',
  first_aid: 'first_aid',
} as const;
export type PictogramId = ValueOf<typeof PictogramId>;

export const VersionStatus = {
  draft: 'draft',
  published: 'published',
  retired: 'retired',
} as const;
export type VersionStatus = ValueOf<typeof VersionStatus>;

/** `source` is the authored text, `machine` an unreviewed translation (SF-01, DR-02). */
export const TranslationState = {
  source: 'source',
  machine: 'machine',
  reviewed: 'reviewed',
} as const;
export type TranslationState = ValueOf<typeof TranslationState>;

/** Whether a safety acknowledgement still covers a visit (SF-01, SF-04, YD-02). */
export const AckStatus = {
  valid: 'valid',
  visit_only: 'visit_only',
  expired: 'expired',
  outdated: 'outdated',
} as const;
export type AckStatus = ValueOf<typeof AckStatus>;

/** Whether a visit's driver holds every briefing the site requires. */
export const SafetyStatus = {
  valid: 'valid',
  missing: 'missing',
  /** No published instruction applies to the site, or the module is off. */
  not_required: 'not_required',
} as const;
export type SafetyStatus = ValueOf<typeof SafetyStatus>;

/** The state of one required briefing for a visit. */
export const InstructionSafety = {
  valid: SafetyStatus.valid,
  missing: SafetyStatus.missing,
} as const;
export type InstructionSafety = ValueOf<typeof InstructionSafety>;

/** A block of briefing content: a paragraph, or a bundled pictogram. */
export const BlockKind = {
  text: 'text',
  pictogram: 'pictogram',
} as const;
export type BlockKind = ValueOf<typeof BlockKind>;

/** An acknowledgement's status when a visit links it (YD-02), or that its briefing no longer applies. */
export const AckLinkStatus = {
  ...AckStatus,
  not_applicable: 'not_applicable',
} as const;
export type AckLinkStatus = ValueOf<typeof AckLinkStatus>;

/** The columns of the acknowledgement register CSV, in file order; `safety:register.csv.<column>` heads each. */
export const AcknowledgementCsvColumn = {
  completedAt: 'completedAt',
  expiresAt: 'expiresAt',
  status: 'status',
  driverName: 'driverName',
  carrier: 'carrier',
  booking: 'booking',
  site: 'site',
  instruction: 'instruction',
  version: 'version',
  locale: 'locale',
  score: 'score',
  attempts: 'attempts',
  channel: 'channel',
} as const;
export type AcknowledgementCsvColumn = ValueOf<typeof AcknowledgementCsvColumn>;
/**
 * What a briefing badge in the design prototype shows for a driver: the visit's safety status, or
 * why the driver's acknowledgement no longer covers it.
 */
export const BriefingState = {
  valid: SafetyStatus.valid,
  missing: SafetyStatus.missing,
  expired: AckStatus.expired,
  outdated: AckStatus.outdated,
} as const;
export type BriefingState = ValueOf<typeof BriefingState>;

/** The steps of the driver's safety briefing (SF-01, DR-02). */
export const BriefingStep = {
  loading: 'loading',
  error: 'error',
  rules: 'rules',
  quiz: 'quiz',
  confirm: 'confirm',
} as const;
export type BriefingStep = ValueOf<typeof BriefingStep>;

/** Whether a briefing applies to every site of the tenant or to the sites chosen for it. */
export const SiteSelection = {
  all: 'all',
  chosen: 'chosen',
} as const;
export type SiteSelection = ValueOf<typeof SiteSelection>;
