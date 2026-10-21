import { catalog, type SettingKey } from '@rampflow/shared';
import type { SettingEntry } from '@rampflow/shared/modules/core/api.settings';
import {
  Setting,
  SettingScope,
  SettingSource,
  SettingsSection,
  SettingsTopic,
} from '@rampflow/shared/values';
import { describe, expect, it } from 'vitest';
import { availableTopics, sectionsOf } from './settings-placement.ts';

/** A default-valued entry for each catalog setting; with a scope, only those it may hold. */
const entriesFor = (scope?: SettingScope): SettingEntry[] =>
  catalog.flatMap((m) =>
    Object.entries(m.settings)
      .filter(([, def]) => !scope || def.scopes.includes(scope))
      .map(([key, def]) => ({
        key: key as SettingKey,
        module: m.id,
        scopes: [...def.scopes],
        value: def.default,
        source: SettingSource.default,
        inherited: { value: def.default, source: SettingSource.default },
      })),
  );

const layout = (items: SettingEntry[]) =>
  availableTopics(items).map((topic) => ({
    topic,
    sections: sectionsOf(topic, items).map((s) => ({
      section: s.section,
      keys: s.items.map((i) => i.key),
    })),
  }));

const { general, booking, avis, safety, yard, privacy } = SettingsTopic;
const S = SettingsSection;

describe('settings placement', () => {
  it('places every setting in the topics and sections of the spec, in order', () => {
    expect(layout(entriesFor())).toEqual([
      {
        topic: general,
        sections: [
          { section: S.sites, keys: [Setting.core.site_countries] },
          { section: S.language, keys: [Setting.i18n.default_locale] },
        ],
      },
      {
        topic: booking,
        sections: [
          {
            section: S.rules,
            keys: [
              Setting.booking.slot_grid_minutes,
              Setting.booking.min_lead_minutes,
              Setting.booking.horizon_days,
              Setting.booking.cancel_cutoff_minutes,
              Setting.booking.close_on_public_holidays,
              Setting.booking.require_plate,
            ],
          },
          {
            section: S.public_booking,
            keys: [Setting.booking.public_link_enabled, Setting.booking.public_registration_mode],
          },
          { section: S.reminders, keys: [Setting.notify.reminder_hours_before] },
        ],
      },
      {
        topic: avis,
        sections: [
          {
            section: S.requirements,
            keys: [
              Setting.avis.required_reference_types,
              Setting.avis.unique_references,
              Setting.avis.require_gross_weight,
              Setting.avis.require_driver_phone,
            ],
          },
        ],
      },
      {
        topic: safety,
        sections: [
          {
            section: S.briefing,
            keys: [
              Setting.safety.validity_days,
              Setting.safety.require_for_checkin,
              Setting.safety.quiz_pass_percent,
            ],
          },
        ],
      },
      {
        topic: yard,
        sections: [
          {
            section: S.arrival,
            keys: [
              Setting.yard.early_tolerance_minutes,
              Setting.yard.grace_minutes,
              Setting.yard.no_show_after_minutes,
            ],
          },
          { section: S.dwell, keys: [Setting.yard.standgeld_flag_minutes] },
        ],
      },
      {
        topic: privacy,
        sections: [
          { section: S.notice, keys: [Setting.privacy.notice_url] },
          {
            section: S.retention,
            keys: [
              Setting.privacy.retention.driver_phone_days,
              Setting.privacy.retention.driver_identity_days,
              Setting.privacy.retention.visit_days,
              Setting.privacy.retention.safety_after_expiry_days,
              Setting.privacy.retention.audit_log_days,
              Setting.privacy.retention.carrier_inactive_days,
            ],
          },
          { section: S.driver_access, keys: [Setting.privacy.retention.driver_link_hours] },
        ],
      },
    ]);
  });

  it('leaves general out of a site view, which holds neither of its settings', () => {
    expect(availableTopics(entriesFor(SettingScope.site))).toEqual([
      booking,
      avis,
      safety,
      yard,
      privacy,
    ]);
  });

  it('drops a section whose settings are all unavailable', () => {
    const items = entriesFor(SettingScope.tenant).filter(
      (e) => e.key !== Setting.notify.reminder_hours_before,
    );
    expect(sectionsOf(booking, items).map((s) => s.section)).not.toContain(S.reminders);
  });
});
