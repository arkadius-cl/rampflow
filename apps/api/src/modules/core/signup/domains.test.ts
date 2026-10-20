import { describe, expect, it } from 'vitest';
import { isDisposable } from './disposable-domains.ts';
import { FREE_MAIL_DOMAINS } from './free-mail-domains.ts';

describe('disposable domains', () => {
  it('matches a listed domain and its subdomains, case-insensitively', () => {
    expect(isDisposable('ops@mailinator.com')).toBe(true);
    expect(isDisposable('ops@eu.mailinator.com')).toBe(true);
    expect(isDisposable('Ops@EU.Mailinator.COM')).toBe(true);
  });

  it('lets a company domain and a free-mail domain pass', () => {
    expect(isDisposable('ops@acme.example')).toBe(false);
    expect(isDisposable('ops@gmail.com')).toBe(false);
    expect(isDisposable('ops@mailinator.com.nordhafen.example')).toBe(false);
  });

  it('lists the free-mail providers of the design', () => {
    expect(FREE_MAIL_DOMAINS.has('gmail.com')).toBe(true);
    expect(FREE_MAIL_DOMAINS.has('wp.pl')).toBe(true);
    expect(FREE_MAIL_DOMAINS.has('acme.example')).toBe(false);
  });
});
