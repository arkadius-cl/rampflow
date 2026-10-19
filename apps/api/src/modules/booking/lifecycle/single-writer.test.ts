import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ADR-0005: transitionBooking is the only writer of booking.status. The ADR names a lint for
// this; until biome.json carries one, this scan fails a change that updates `booking` elsewhere.

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const WRITER = 'modules/booking/lifecycle/transition.ts';
const UPDATE_BOOKING = /\.update\(\s*booking\s*\)/;

function bookingUpdatesOutsideWriter(files: readonly { path: string; text: string }[]) {
  return files
    .filter((f) => f.path !== WRITER && !/\.test\.tsx?$/.test(f.path))
    .filter((f) => UPDATE_BOOKING.test(f.text))
    .map((f) => f.path);
}

describe('the single writer of booking (ADR-0005)', () => {
  it('finds no update of the booking table outside transition.ts', () => {
    const files = globSync('**/*.{ts,tsx}', { cwd: SRC }).map((path) => ({
      path,
      text: readFileSync(join(SRC, path), 'utf8'),
    }));
    expect(files.some((f) => f.path === WRITER)).toBe(true);
    expect(bookingUpdatesOutsideWriter(files)).toEqual([]);
  });

  it('flags a status update in another module', () => {
    const yard = {
      path: 'modules/yard/check-in.ts',
      text: "await tx.update(booking).set({ status: 'checked_in' });",
    };
    expect(bookingUpdatesOutsideWriter([yard])).toEqual(['modules/yard/check-in.ts']);
  });
});
