import { catalog, type SettingKey } from '@rampflow/shared';
import { findSetting } from '@rampflow/shared/contract/catalog';
import { SettingControl } from '@rampflow/shared/modules/core/values';
import * as z from 'zod';

// The control of a settings field follows from its zod schema in the manifest, so a new setting
// gets a fitting control without screen code (TN-02, PL-03).

export type ControlSpec =
  | { kind: typeof SettingControl.switch }
  | { kind: typeof SettingControl.select; options: readonly (string | number)[] }
  | { kind: typeof SettingControl.number; min: number; max: number }
  | { kind: typeof SettingControl.list; options: readonly string[] }
  | { kind: typeof SettingControl.url };

export function controlOf(schema: z.ZodType): ControlSpec {
  if (schema instanceof z.ZodReadonly) return controlOf(schema.unwrap() as z.ZodType);
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
    return { kind: SettingControl.list, options: schema.element.options as string[] };
  }
  if (schema instanceof z.ZodNullable && schema.unwrap() instanceof z.ZodURL)
    return { kind: SettingControl.url };
  throw new Error('No settings control for this schema');
}

export function settingDef(key: SettingKey) {
  const found = findSetting(catalog, key);
  if (!found) throw new Error(`Setting ${key} is not in the catalog`);
  return found.def;
}
