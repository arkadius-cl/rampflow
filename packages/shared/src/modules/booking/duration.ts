import type { Entitlements } from '../../registry.ts';
import { Feature } from '../../values/keys.ts';
import type { LoadTypeDuration } from './api.capacity.ts';
import { DurationKind } from './values.ts';

/**
 * Elapsed minutes a load takes (MD-05). Tiers pick the first tier whose `upTo` holds the load
 * units; without `booking.duration_rules` a tiered type uses its largest tier.
 */
export function durationFor(
  loadType: { duration: LoadTypeDuration },
  loadUnits: number,
  entitlements: Pick<Entitlements, 'features'>,
): number {
  const { duration } = loadType;
  if (duration.kind === DurationKind.fixed) return duration.minutes;
  if (!entitlements.features[Feature.booking.duration_rules]) {
    return Math.max(...duration.tiers.map((t) => t.minutes));
  }
  const tier = duration.tiers.find((t) => t.upTo === null || loadUnits <= t.upTo);
  return (tier ?? duration.tiers[duration.tiers.length - 1])?.minutes ?? 0;
}
