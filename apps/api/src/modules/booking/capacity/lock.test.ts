import { beforeAll, describe, expect, it } from 'vitest';
import { type World, world } from '../../../../test/world.ts';
import type { SiteId } from '../../../db/ids.ts';
import { withScope } from '../../../db/scope.ts';
import { lockSiteCapacity } from './lock.ts';

let w: World;
beforeAll(async () => {
  w = await world();
});

const scope = () =>
  ({
    party: 'tenant',
    tenantId: w.A.tenantId,
    siteIds: 'all',
    actor: { kind: 'user', userId: w.A.users.dispatcher.id, role: 'dispatcher' },
  }) as const;

/** Holds the site lock in its own transaction until `release` is called. */
function holdLock(siteId: SiteId) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked = () => {};
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const done = withScope(scope(), async (tx) => {
    await lockSiteCapacity(tx, siteId);
    locked();
    await released;
  });
  return { acquired, done, release };
}

describe('lockSiteCapacity', () => {
  it('makes a second writer of the same site wait until the first commits', async () => {
    const siteId = w.A.sites[0].id;
    const first = holdLock(siteId);
    await first.acquired;
    const order: string[] = [];
    const second = withScope(scope(), async (tx) => {
      await lockSiteCapacity(tx, siteId);
      order.push('second locked');
    });
    await new Promise((r) => setTimeout(r, 150));
    order.push('first commits');
    first.release();
    await Promise.all([first.done, second]);
    expect(order).toEqual(['first commits', 'second locked']);
  });

  it('lets writers of different sites run side by side', async () => {
    const first = holdLock(w.A.sites[0].id);
    await first.acquired;
    const other = holdLock(w.A.sites[1].id);
    await other.acquired;
    other.release();
    first.release();
    await Promise.all([first.done, other.done]);
  });
});
