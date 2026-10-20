import type { Salutation } from '@rampflow/shared/modules/core/values';
import type { TFunction } from 'i18next';

export interface GreetingNames {
  salutation: Salutation | null;
  givenName: string;
  familyName: string;
}

/** person-names: salutation and family name when set, else a neutral form with both names. */
export function greeting(t: TFunction, names: GreetingNames): string {
  const values = { given: names.givenName, family: names.familyName };
  return t(`signup.greeting.${names.salutation ?? 'none'}`, values);
}
