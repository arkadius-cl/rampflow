import { describe, expect, it } from 'vitest';
import { Theme, ThemeSurface } from '../../values/index.ts';
import { isTheme, resolveTheme, THEME_DEFAULT } from './theme.ts';

describe('resolveTheme', () => {
  it('follows the OS when the choice is system', () => {
    expect(resolveTheme(Theme.system, true)).toBe(Theme.dark);
    expect(resolveTheme(Theme.system, false)).toBe(Theme.light);
  });

  it('lets a stored choice win over the OS', () => {
    expect(resolveTheme(Theme.light, true)).toBe(Theme.light);
    expect(resolveTheme(Theme.dark, false)).toBe(Theme.dark);
  });

  it('defaults per surface: office and driver follow the OS, a station is light', () => {
    expect(resolveTheme(THEME_DEFAULT[ThemeSurface.office], true)).toBe(Theme.dark);
    expect(resolveTheme(THEME_DEFAULT[ThemeSurface.driver], true)).toBe(Theme.dark);
    expect(resolveTheme(THEME_DEFAULT[ThemeSurface.station], true)).toBe(Theme.light);
  });

  it('recognises only the three choices', () => {
    expect(isTheme(Theme.dark)).toBe(true);
    expect(isTheme('auto')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});
