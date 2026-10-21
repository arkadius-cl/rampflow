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
          { section: S.sites, keys: ['core.site_countries'] },
          { section: S.language, keys: ['i18n.default_locale'] },
        ],
      },
      {
        topic: booking,
        sections: [
          {
            section: S.rules,
            keys: [
              'booking.slot_grid_minutes',
              'booking.min_lead_minutes',
              'booking.horizon_days',
              'booking.cancel_cutoff_minutes',
              'booking.close_on_public_holidays',
              'booking.require_plate',
            ],
          },
          {
            section: S.public_booking,
            keys: ['booking.public_link_enabled', 'booking.public_registration_mode'],
          },
          { section: S.reminders, keys: ['notify.reminder_hours_before'] },
        ],
      },
      {
        topic: avis,
        sections: [
          {
            section: S.requirements,
            keys: [
              'avis.required_reference_types',
              'avis.unique_references',
              'avis.require_gross_weight',
              'avis.require_driver_phone',
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
              'safety.validity_days',
              'safety.require_for_checkin',
              'safety.quiz_pass_percent',
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
              'yard.early_tolerance_minutes',
              'yard.grace_minutes',
              'yard.no_show_after_minutes',
            ],
          },
          { section: S.dwell, keys: ['yard.standgeld_flag_minutes'] },
        ],
      },
      {
        topic: privacy,
        sections: [
          { section: S.notice, keys: ['privacy.notice_url'] },
          {
            section: S.retention,
            keys: [
              'privacy.retention.driver_phone_days',
              'privacy.retention.driver_identity_days',
              'privacy.retention.visit_days',
              'privacy.retention.safety_after_expiry_days',
              'privacy.retention.audit_log_days',
              'privacy.retention.carrier_inactive_days',
            ],
          },
          { section: S.driver_access, keys: ['privacy.retention.driver_link_hours'] },
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
