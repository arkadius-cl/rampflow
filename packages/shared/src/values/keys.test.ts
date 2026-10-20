import { describe, expect, it } from 'vitest';
import { catalog } from '../registry.ts';
import { Feature, Limit, Module, Permission, Setting } from './keys.ts';

const leaves = (tree: object): string[] =>
  Object.values(tree).flatMap((v) => (typeof v === 'string' ? [v] : leaves(v)));

describe('manifest key trees', () => {
  it('hold each key at its path', () => {
    expect(Permission.booking.view).toBe('booking.view');
    expect(Feature.booking.pools).toBe('booking.pools');
    expect(Limit.core.max_sites).toBe('core.max_sites');
    expect(Setting.privacy.retention.visit_days).toBe('privacy.retention.visit_days');
    expect(Module.yard).toBe('yard');
  });

  it('hold every manifest key and no reserved feature', () => {
    const all = (pick: (m: (typeof catalog)[number]) => object) =>
      catalog.flatMap((m) => Object.keys(pick(m))).sort();
    expect(leaves(Permission).sort()).toEqual(all((m) => m.permissions));
    expect(leaves(Setting).sort()).toEqual(all((m) => m.settings));
    expect(leaves(Feature)).not.toContain('booking.guest_link');
    expect(Object.values(Module)).toEqual(catalog.map((m) => m.id));
  });
});
