import { describe, expect, it } from 'vitest';
import { searchable } from './search.ts';

describe('searchable', () => {
  it('folds case and accents', () => {
    expect(searchable('Türkiye')).toBe('turkiye');
    expect(searchable('Österreich')).toBe('osterreich');
  });

  it('folds the letters NFD keeps whole', () => {
    expect(searchable('Włochy')).toBe('wlochy');
    expect(searchable('Straße')).toBe('strasse');
  });
});
