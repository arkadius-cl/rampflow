import * as z from 'zod';
import { catalog } from '../../registry.ts';

// Per-user UI state stored in app_user.ui_prefs and merged per key (ADR-0014).

const ModuleIdSchema = z.enum(catalog.map((m) => m.id));

const OpenModules = z
  .array(ModuleIdSchema)
  .max(catalog.length)
  .refine((ids) => new Set(ids).size === ids.length, 'Module ids must be unique');

/** Every known key with its value schema. Keys are `<area>.<screen>.<what>`. */
export const UI_PREFS = {
  'platform.packages.openModules': OpenModules,
  'platform.tenant.openModules': OpenModules,
} as const;

export type UiPrefKey = keyof typeof UI_PREFS;

export const UiPrefs = z.strictObject(UI_PREFS).partial();
export type UiPrefs = z.infer<typeof UiPrefs>;

const isKnownKey = (key: string): key is UiPrefKey => Object.hasOwn(UI_PREFS, key);

/** Reads the stored object key by key, dropping unknown keys and values that no longer parse. */
export function parseStoredUiPrefs(stored: unknown): UiPrefs {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  const prefs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!isKnownKey(key)) continue;
    const parsed = UI_PREFS[key].safeParse(value);
    if (parsed.success) prefs[key] = parsed.data;
  }
  return prefs as UiPrefs;
}
