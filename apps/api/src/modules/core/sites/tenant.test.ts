import { ProfileForeignKey, ResourceDockConstraint } from '@rampflow/shared/modules/booking/values';
import { ConflictReason, ErrorCode, SqlState, values } from '@rampflow/shared/values';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../kernel/errors.ts';
import { conflictOnMembership, conflictOnProfile } from './tenant.ts';

// Drizzle wraps the driver's error; the mapping looks through `cause`.
const pg = (code: string, constraint: string) =>
  Object.assign(new Error('Failed query'), { cause: { code, constraint } });

const caught = (fn: () => never) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('did not throw');
};

describe('conflictOnProfile', () => {
  it.each(values(ProfileForeignKey))(
    'maps a violation of %s to 409 profile_mismatch',
    (constraint) => {
      const e = caught(() => conflictOnProfile(pg(SqlState.foreign_key_violation, constraint)));
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({
        code: ErrorCode.conflict,
        status: 409,
        details: { reason: ConflictReason.profile_mismatch },
      });
    },
  );

  it('rethrows other foreign key violations unchanged', () => {
    const original = pg(
      SqlState.foreign_key_violation,
      'resource_dock_dock_id_site_id_dock_id_site_id_fk',
    );
    expect(caught(() => conflictOnProfile(original))).toBe(original);
  });
});

describe('conflictOnMembership', () => {
  it('maps a second membership of a dock to 409 dock_in_resource', () => {
    const e = caught(() =>
      conflictOnMembership(
        pg(SqlState.unique_violation, ResourceDockConstraint.resource_dock_pkey),
      ),
    );
    expect(e).toMatchObject({ details: { reason: ConflictReason.dock_in_resource } });
  });

  it('maps a profile key violation to 409 profile_mismatch', () => {
    const e = caught(() =>
      conflictOnMembership(
        pg(SqlState.foreign_key_violation, ProfileForeignKey.resource_dock_resource_profile_fk),
      ),
    );
    expect(e).toMatchObject({ details: { reason: ConflictReason.profile_mismatch } });
  });
});
