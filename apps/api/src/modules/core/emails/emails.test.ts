import { createServerI18n } from '@rampflow/i18n/server';
import { Salutation } from '@rampflow/shared/modules/core/values';
import { EmailCategory, StaffLocale, TokenPurpose, values } from '@rampflow/shared/values';
import { render as renderEmail } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { env } from '../../../kernel/env.ts';
import { loadTemplateFile } from '../../../kernel/outbox.ts';
import { deriveToken } from '../../../kernel/tokens.ts';

// The account emails of U2 as the outbox worker renders them: every staff locale, no raw key,
// and the link carries the token derived from the payload's row id in the fragment.

const TEMPLATES: { id: string; purpose: TokenPurpose; path: string; idField: string }[] = [
  {
    id: 'core.magic-link',
    purpose: TokenPurpose.magic_link,
    path: '/auth/magic#',
    idField: 'authTokenId',
  },
  {
    id: 'core.password-reset',
    purpose: TokenPurpose.password_reset,
    path: '/auth/reset#',
    idField: 'authTokenId',
  },
  {
    id: 'core.invitation',
    purpose: TokenPurpose.invitation,
    path: '/invite#',
    idField: 'invitationId',
  },
  {
    id: 'core.signup-verify',
    purpose: TokenPurpose.signup,
    path: '/signup/verify#',
    idField: 'signupId',
  },
];

describe('account emails', () => {
  for (const tpl of TEMPLATES) {
    for (const locale of values(StaffLocale)) {
      it(`${tpl.id} renders in ${locale} with its fragment link`, async () => {
        const template = await loadTemplateFile(tpl.id);
        expect(template.category).toBe('account');
        const i18n = await createServerI18n(locale);
        const { subject, body } = template.render(template.example, i18n.getFixedT(locale, 'core'));
        const text = await renderEmail(body, { plainText: true });
        expect(subject).not.toMatch(/^auth\.|\{\{/);
        expect(text).not.toMatch(/auth\.email\.|shell\.roles\.|\{\{/);
        const rowId = (template.example as Record<string, string>)[tpl.idField] as string;
        expect(text).toContain(`${env.APP_ORIGIN}${tpl.path}${deriveToken(tpl.purpose, rowId)}`);
      });
    }
  }

  it('names the inviter and the role in the recipient language', async () => {
    const template = await loadTemplateFile('core.invitation');
    const i18n = await createServerI18n('de');
    const { subject, body } = template.render(template.example, i18n.getFixedT('de', 'core'));
    expect(subject).toBe('Ihre Einladung zu Acme Logistics bei rampflow');
    expect(await renderEmail(body, { plainText: true })).toContain(
      'Anna Lenz lädt Sie ein, Acme Logistics bei rampflow als Disponent beizutreten.',
    );
  });
});

describe('registration emails', () => {
  const textOf = async (id: string, payload: unknown, locale: StaffLocale) => {
    const template = await loadTemplateFile(id);
    const i18n = await createServerI18n(locale);
    const { subject, body } = template.render(payload, i18n.getFixedT(locale, 'core'));
    return { template, subject, text: await renderEmail(body, { plainText: true }) };
  };
  const verify = (salutation: Salutation | null, givenName: string, familyName: string) => ({
    signupId: '01900000-0000-7000-8000-000000000010',
    companyName: 'Nordhafen Kühllogistik GmbH',
    salutation,
    givenName,
    familyName,
  });

  const GREETINGS: [StaffLocale, Salutation | null, string][] = [
    [StaffLocale.de, Salutation.mr, 'Sehr geehrter Herr Petersen,'],
    [StaffLocale.de, Salutation.ms, 'Sehr geehrte Frau Petersen,'],
    [StaffLocale.de, null, 'Guten Tag Jonas Petersen,'],
    [StaffLocale.en, Salutation.mr, 'Dear Mr Petersen,'],
    [StaffLocale.en, Salutation.ms, 'Dear Ms Petersen,'],
    [StaffLocale.en, null, 'Hello Jonas Petersen,'],
    [StaffLocale.pl, Salutation.mr, 'Szanowny Panie,'],
    [StaffLocale.pl, Salutation.ms, 'Szanowna Pani,'],
    [StaffLocale.pl, null, 'Dzień dobry Jonas Petersen,'],
  ];
  for (const [locale, salutation, expected] of GREETINGS) {
    it(`greets ${salutation ?? 'without salutation'} in ${locale} with "${expected}"`, async () => {
      const { text } = await textOf(
        'core.signup-verify',
        verify(salutation, 'Jonas', 'Petersen'),
        locale,
      );
      expect(text.trimStart().startsWith(expected)).toBe(true);
    });
  }

  it('greets Anna Lenz as "Sehr geehrte Frau Lenz,"', async () => {
    const { text } = await textOf(
      'core.signup-verify',
      verify(Salutation.ms, 'Anna', 'Lenz'),
      StaffLocale.de,
    );
    expect(text.trimStart()).toMatch(/^Sehr geehrte Frau Lenz,/);
  });

  for (const locale of values(StaffLocale)) {
    it(`core.signup-known-account renders in ${locale} with a sign-in link and no form data`, async () => {
      const template = await loadTemplateFile('core.signup-known-account');
      expect(template.category).toBe(EmailCategory.account);
      const { subject, text } = await textOf('core.signup-known-account', template.example, locale);
      expect(subject).not.toMatch(/^signup\.|\{\{/);
      expect(text).not.toMatch(/signup\.email\.|\{\{/);
      expect(text).toContain(`${env.APP_ORIGIN}/login`);
    });
  }

  it('keeps no token or link in either payload', async () => {
    for (const id of ['core.signup-verify', 'core.signup-known-account']) {
      const { example } = await loadTemplateFile(id);
      const json = JSON.stringify(example);
      expect(json).not.toMatch(/https?:|#/);
      expect(json).not.toContain(deriveToken(TokenPurpose.signup, verify(null, '', '').signupId));
    }
  });
});
