import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { StaffLocale } from '@rampflow/shared/values';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSyncLocale } from '@/components/app-shell/user-menu';
import { i18n, Providers } from '@/test/render';
import { applyLocale, pickLocale } from './i18n.ts';

// ADR-0009: account, then this device's choice, then the browser, then the tenant default, then de.

const browserPrefers = (...tags: string[]) =>
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(tags);

afterEach(async () => {
  vi.restoreAllMocks();
  await applyLocale(i18n, StaffLocale.en);
  localStorage.clear();
});

const userWith = (locale: StaffLocale | null): MeResponse => ({
  user: { id: '00000000-0000-4000-8000-000000000001', name: 'Ada', email: 'a@x.test', locale },
  memberships: [],
  uiPrefs: {},
});

describe('pickLocale', () => {
  it('lets a stored choice of English beat the tenant default for a user without a locale', () => {
    browserPrefers('de-DE');
    localStorage.setItem('rf_locale', StaffLocale.en);
    expect(pickLocale(null, StaffLocale.de)).toBe(StaffLocale.en);
  });

  it("lets the account's Polish beat a stored English", () => {
    localStorage.setItem('rf_locale', StaffLocale.en);
    expect(pickLocale(StaffLocale.pl, StaffLocale.de)).toBe(StaffLocale.pl);
  });

  it('gives a Turkish browser without a choice the tenant default', () => {
    localStorage.clear();
    browserPrefers('tr-TR', 'tr');
    expect(pickLocale(null, StaffLocale.pl)).toBe(StaffLocale.pl);
    expect(pickLocale(null)).toBe(StaffLocale.de);
  });

  it('takes the first browser language the UI has', () => {
    localStorage.clear();
    browserPrefers('tr', 'pl-PL', 'en');
    expect(pickLocale(null, StaffLocale.de)).toBe(StaffLocale.pl);
  });
});

describe('useSyncLocale', () => {
  it('shows the tenant default without taking it for the device choice', async () => {
    localStorage.clear();
    browserPrefers('tr');
    renderHook(() => useSyncLocale(userWith(null), StaffLocale.pl), { wrapper: Providers });
    await waitFor(() => expect(i18n.language).toBe(StaffLocale.pl));
    expect(localStorage.getItem('rf_locale')).toBeNull();
  });

  it('keeps the device choice over the tenant default', async () => {
    await applyLocale(i18n, StaffLocale.en);
    const change = vi.spyOn(i18n, 'changeLanguage');
    renderHook(() => useSyncLocale(userWith(null), StaffLocale.de), { wrapper: Providers });
    expect(change).not.toHaveBeenCalled();
    expect(i18n.language).toBe(StaffLocale.en);
  });
});
