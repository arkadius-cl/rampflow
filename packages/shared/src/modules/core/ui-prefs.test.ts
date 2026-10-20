import { describe, expect, it } from 'vitest';
import { ZodIssueCode } from '../../values/validation.ts';
import { parseStoredUiPrefs, UiPrefs } from './ui-prefs.ts';

describe('parseStoredUiPrefs', () => {
  it('keeps known keys with valid values', () => {
    const stored = {
      'platform.packages.openModules': ['yard', 'safety'],
      'platform.tenant.openModules': [],
    };
    expect(parseStoredUiPrefs(stored)).toEqual(stored);
  });

  it('drops an unknown key', () => {
    expect(
      parseStoredUiPrefs({ 'platform.unknown': true, 'platform.tenant.openModules': ['yard'] }),
    ).toEqual({ 'platform.tenant.openModules': ['yard'] });
  });

  it('drops a key whose value holds an unknown module id', () => {
    expect(parseStoredUiPrefs({ 'platform.packages.openModules': ['yard', 'nope'] })).toEqual({});
  });

  it('answers {} for anything but an object', () => {
    expect(parseStoredUiPrefs(null)).toEqual({});
    expect(parseStoredUiPrefs([])).toEqual({});
    expect(parseStoredUiPrefs('x')).toEqual({});
  });
});

describe('UiPrefs', () => {
  it('rejects duplicate module ids', () => {
    const result = UiPrefs.safeParse({ 'platform.packages.openModules': ['yard', 'yard'] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown key and names it', () => {
    const result = UiPrefs.safeParse({ 'platform.unknown': [] });
    expect(result.error?.issues).toMatchObject([
      { code: ZodIssueCode.unrecognized_keys, path: [], keys: ['platform.unknown'] },
    ]);
  });
});
