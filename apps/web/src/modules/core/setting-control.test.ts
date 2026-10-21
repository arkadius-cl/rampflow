import { CountryGroup, SettingControl } from '@rampflow/shared/modules/core/values';
import { Setting } from '@rampflow/shared/values';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { controlOf, settingDef } from './setting-control.ts';

describe('controlOf', () => {
  it('groups the admitted countries into EU and other', () => {
    const key = Setting.core.site_countries;
    const spec = controlOf(key, settingDef(key).schema);
    if (spec.kind !== SettingControl.grouped_list) throw new Error(`got ${spec.kind}`);
    expect(spec.groups.map((g) => [g.id, g.options.length])).toEqual([
      [CountryGroup.eu, 27],
      [CountryGroup.other, 30],
    ]);
  });

  it('refuses a long enum list without groups', () => {
    const many = z.array(z.enum(Array.from({ length: 21 }, (_, i) => `o${i}`)));
    expect(() => controlOf(Setting.avis.required_reference_types, many)).toThrow(/OPTION_GROUPS/);
  });

  it('keeps a short enum list flat', () => {
    const key = Setting.avis.required_reference_types;
    expect(controlOf(key, settingDef(key).schema).kind).toBe(SettingControl.list);
  });
});
