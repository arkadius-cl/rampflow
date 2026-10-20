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
