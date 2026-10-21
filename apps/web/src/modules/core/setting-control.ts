import { catalog, type SettingKey } from '@rampflow/shared';
import { findSetting } from '@rampflow/shared/contract/catalog';
import {
  CountryGroup,
  countryGroupOf,
  SettingControl,
  type SiteCountry,
} from '@rampflow/shared/modules/core/values';
import { Setting, values } from '@rampflow/shared/values';
import * as z from 'zod';

// The control of a settings field follows from its zod schema in the manifest, so a new setting
// gets a fitting control without screen code (TN-02, PL-03).

export interface OptionGroup {
  id: string;
  options: readonly string[];
}

export type ControlSpec =
  | { kind: typeof SettingControl.switch }
  | { kind: typeof SettingControl.select; options: readonly (string | number)[] }
  | { kind: typeof SettingControl.number; min: number; max: number }
  | { kind: typeof SettingControl.list; options: readonly string[] }
  | { kind: typeof SettingControl.grouped_list; groups: readonly OptionGroup[] }
  | { kind: typeof SettingControl.url };

interface Grouping {
  /** The groups in display order. */
  ids: readonly string[];
  of: (option: string) => string;
}

/** Long enum lists and how they split into groups (PL-03). */
const OPTION_GROUPS: Partial<Record<SettingKey, Grouping>> = {
  [Setting.core.site_countries]: {
    ids: values(CountryGroup),
    of: (code) => countryGroupOf(code as SiteCountry),
  },
};

/** Beyond this many members a flat checkbox list gets too long to scan. */
const FLAT_LIST_MAX = 20;

export function controlOf(key: SettingKey, schema: z.ZodType): ControlSpec {
  if (schema instanceof z.ZodReadonly) return controlOf(key, schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodBoolean) return { kind: SettingControl.switch };
  if (schema instanceof z.ZodEnum) return { kind: SettingControl.select, options: schema.options };
  if (schema instanceof z.ZodLiteral) {
    return { kind: SettingControl.select, options: [...schema.values] as (string | number)[] };
  }
  if (schema instanceof z.ZodNumber) {
    return {
      kind: SettingControl.number,
      min: schema.minValue ?? 0,
      max: schema.maxValue ?? 2 ** 31 - 1,
    };
  }
  if (schema instanceof z.ZodArray && schema.element instanceof z.ZodEnum) {
    const options = schema.element.options as string[];
    const grouping = OPTION_GROUPS[key];
    if (grouping) {
      const groups = grouping.ids.map((id) => ({
        id,
        options: options.filter((o) => grouping.of(o) === id),
      }));
      return { kind: SettingControl.grouped_list, groups };
    }
    if (options.length > FLAT_LIST_MAX) {
      throw new Error(`${key}: ${options.length} options need groups in OPTION_GROUPS`);
    }
    return { kind: SettingControl.list, options };
  }
  if (schema instanceof z.ZodNullable && schema.unwrap() instanceof z.ZodURL)
    return { kind: SettingControl.url };
  throw new Error(`${key}: no settings control for this schema`);
}

export function settingDef(key: SettingKey) {
  const found = findSetting(catalog, key);
  if (!found) throw new Error(`Setting ${key} is not in the catalog`);
  return found.def;
}
