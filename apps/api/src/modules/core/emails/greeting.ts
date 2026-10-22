import type { Salutation } from '@rampflow/shared/modules/core/values';
import type { TFunction } from 'i18next';

export interface GreetingNames {
  salutation: Salutation | null;
  givenName: string;
  familyName: string;
}

/**
 * person-names: salutation and family name when set, else a neutral form with both names. A
 * user with only a display name passes it as `givenName` and an empty `familyName`.
 */
export function greeting(t: TFunction, names: GreetingNames): string {
  const values = { given: names.givenName, family: names.familyName };
  const form = names.familyName === '' ? null : names.salutation;
  return t(`signup.greeting.${form ?? 'none'}`, values).replace(/\s+(?=,)/, '');
}
