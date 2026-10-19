import type { Limit } from '@rampflow/shared';
import { useTranslation } from 'react-i18next';
import { useFormat } from './format';

// Labels and values of entitlements for the platform screens (PL-02).

/** `<module>:entitlements.<rest>`, the label the manifests derive. */
export function useEntitlementLabel() {
  const { t } = useTranslation();
  return (key: string) => {
    const dot = key.indexOf('.');
    return t(`${key.slice(0, dot)}:entitlements.${key.slice(dot + 1)}` as never) as string;
  };
}

/** On or off for features, a number or "unlimited" for limits. */
export function useEntitlementValue() {
  const { t } = useTranslation();
  const format = useFormat();
  return (value: boolean | Limit | undefined) => {
    if (value === undefined || value === false) return t(($) => $.platform.values.off);
    if (value === true) return t(($) => $.platform.values.on);
    if (value === null) return t(($) => $.platform.unlimited);
    return format.number(value);
  };
}

/** Order of entitlement values: off < 0 < 1 < ... < on and unlimited. */
export const rank = (value: boolean | Limit | undefined): number => {
  if (value === undefined || value === false) return 0;
  if (value === true || value === null) return Number.POSITIVE_INFINITY;
  return value;
};
