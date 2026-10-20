import { readFileSync } from 'node:fs';

// Design decision 8: the vendored CC0 list of disposable email domains, loaded once.

const DISPOSABLE = new Set(
  readFileSync(new URL('./disposable-domains.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith('#')),
);

/** The lower-cased part after the last `@`. */
export const emailDomain = (email: string): string =>
  email.slice(email.lastIndexOf('@') + 1).toLowerCase();

/** Whether the email's domain or one of its parent domains is on the list. */
export function isDisposable(email: string): boolean {
  const labels = emailDomain(email).split('.');
  return labels.some((_, i) => DISPOSABLE.has(labels.slice(i).join('.')));
}
