import type { SettingKey } from '@rampflow/shared';
import type { SettingEntry } from '@rampflow/shared/modules/core/api.settings';
import { Setting, SettingsSection, SettingsTopic, SettingUnit } from '@rampflow/shared/values';

// Where each setting appears on the settings pages (ADR-0020). Map order is display order.
// A new manifest setting fails the typecheck until it is placed here.

export interface Placement {
  topic: SettingsTopic;
  section: SettingsSection;
  unit?: SettingUnit;
}

const { general, booking, avis, safety, yard, privacy } = SettingsTopic;
const S = SettingsSection;
const U = SettingUnit;

export const PLACEMENT = {
  [Setting.core.site_countries]: { topic: general, section: S.sites },
  [Setting.i18n.default_locale]: { topic: general, section: S.language },

  [Setting.booking.slot_grid_minutes]: { topic: booking, section: S.rules, unit: U.minutes },
  [Setting.booking.min_lead_minutes]: { topic: booking, section: S.rules, unit: U.minutes },
  [Setting.booking.horizon_days]: { topic: booking, section: S.rules, unit: U.days },
  [Setting.booking.cancel_cutoff_minutes]: { topic: booking, section: S.rules, unit: U.minutes },
  [Setting.booking.close_on_public_holidays]: { topic: booking, section: S.rules },
  [Setting.booking.require_plate]: { topic: booking, section: S.rules },
  [Setting.booking.public_link_enabled]: { topic: booking, section: S.public_booking },
  [Setting.booking.public_registration_mode]: { topic: booking, section: S.public_booking },
  [Setting.notify.reminder_hours_before]: { topic: booking, section: S.reminders, unit: U.hours },

  [Setting.avis.required_reference_types]: { topic: avis, section: S.requirements },
  [Setting.avis.unique_references]: { topic: avis, section: S.requirements },
  [Setting.avis.require_gross_weight]: { topic: avis, section: S.requirements },
  [Setting.avis.require_driver_phone]: { topic: avis, section: S.requirements },

  [Setting.safety.validity_days]: { topic: safety, section: S.briefing, unit: U.days },
  [Setting.safety.require_for_checkin]: { topic: safety, section: S.briefing },
  [Setting.safety.quiz_pass_percent]: { topic: safety, section: S.briefing, unit: U.percent },

  [Setting.yard.early_tolerance_minutes]: { topic: yard, section: S.arrival, unit: U.minutes },
  [Setting.yard.grace_minutes]: { topic: yard, section: S.arrival, unit: U.minutes },
  [Setting.yard.no_show_after_minutes]: { topic: yard, section: S.arrival, unit: U.minutes },
  [Setting.yard.standgeld_flag_minutes]: { topic: yard, section: S.dwell, unit: U.minutes },

  [Setting.privacy.notice_url]: { topic: privacy, section: S.notice },
  [Setting.privacy.retention.driver_phone_days]: {
    topic: privacy,
    section: S.retention,
    unit: U.days,
  },
  [Setting.privacy.retention.driver_identity_days]: {
    topic: privacy,
    section: S.retention,
    unit: U.days,
  },
  [Setting.privacy.retention.visit_days]: { topic: privacy, section: S.retention, unit: U.days },
  [Setting.privacy.retention.safety_after_expiry_days]: {
    topic: privacy,
    section: S.retention,
    unit: U.days,
  },
  [Setting.privacy.retention.audit_log_days]: {
    topic: privacy,
    section: S.retention,
    unit: U.days,
  },
  [Setting.privacy.retention.carrier_inactive_days]: {
    topic: privacy,
    section: S.retention,
    unit: U.days,
  },
  [Setting.privacy.retention.driver_link_hours]: {
    topic: privacy,
    section: S.driver_access,
    unit: U.hours,
  },
} as const satisfies Record<SettingKey, Placement>;

const PLACED = Object.entries(PLACEMENT) as [SettingKey, Placement][];

/** The topics that hold at least one of the level's available settings, in navigation order. */
export function availableTopics(items: readonly SettingEntry[]): SettingsTopic[] {
  const present = new Set(items.map((i) => PLACEMENT[i.key].topic));
  return Object.values(SettingsTopic).filter((t) => present.has(t));
}

export interface PlacedSection {
  section: SettingsSection;
  items: SettingEntry[];
}

/** The topic's sections with their available settings, in placement order; empty ones left out. */
export function sectionsOf(topic: SettingsTopic, items: readonly SettingEntry[]): PlacedSection[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const sections: PlacedSection[] = [];
  for (const [key, placement] of PLACED) {
    const entry = byKey.get(key);
    if (placement.topic !== topic || !entry) continue;
    const last = sections.at(-1);
    if (last?.section === placement.section) last.items.push(entry);
    else sections.push({ section: placement.section, items: [entry] });
  }
  return sections;
}
