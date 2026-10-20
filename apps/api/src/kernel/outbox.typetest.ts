// Compile-time proof that the template files fill `EmailTemplates` with exactly the ids of the
// shared `EmailTemplate` set: a template without an id, or an id without a template, fails here.
import type { EmailTemplate } from '@rampflow/shared/values';
import type { EmailTemplates } from './outbox.ts';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const proof = <T extends true>() => undefined as unknown as T;

export const templates = proof<Equal<keyof EmailTemplates, EmailTemplate>>();
