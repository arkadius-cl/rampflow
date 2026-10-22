import { describe, expect, it } from 'vitest';
import { Theme, UiPref } from '../../values/ui.ts';
import { ZodIssueCode } from '../../values/validation.ts';
import { parseStoredUiPrefs, UiPrefs } from './ui-prefs.ts';

describe('parseStoredUiPrefs', () => {
  it('keeps known keys with valid values', () => {
    const stored = {
      [UiPref.platform_packages_open_modules]: ['yard', 'safety'],
      [UiPref.platform_tenant_open_modules]: [],
    };
    expect(parseStoredUiPrefs(stored)).toEqual(stored);
  });

  it('drops an unknown key', () => {
    expect(
      parseStoredUiPrefs({
        'platform.unknown': true,
        [UiPref.platform_tenant_open_modules]: ['yard'],
      }),
    ).toEqual({ [UiPref.platform_tenant_open_modules]: ['yard'] });
  });

  it('keeps the theme choice and drops one that is not a theme', () => {
    expect(parseStoredUiPrefs({ [UiPref.app_theme]: Theme.dark })).toEqual({
      [UiPref.app_theme]: Theme.dark,
    });
    expect(parseStoredUiPrefs({ [UiPref.app_theme]: 'sepia' })).toEqual({});
  });

  it('drops a key whose value holds an unknown module id', () => {
    expect(
      parseStoredUiPrefs({ [UiPref.platform_packages_open_modules]: ['yard', 'nope'] }),
    ).toEqual({});
  });

  it('answers {} for anything but an object', () => {
    expect(parseStoredUiPrefs(null)).toEqual({});
    expect(parseStoredUiPrefs([])).toEqual({});
    expect(parseStoredUiPrefs('x')).toEqual({});
  });
});

describe('UiPrefs', () => {
  it('rejects duplicate module ids', () => {
    const result = UiPrefs.safeParse({ [UiPref.platform_packages_open_modules]: ['yard', 'yard'] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown key and names it', () => {
    const result = UiPrefs.safeParse({ 'platform.unknown': [] });
    expect(result.error?.issues).toMatchObject([
      { code: ZodIssueCode.unrecognized_keys, path: [], keys: ['platform.unknown'] },
    ]);
  });
});
