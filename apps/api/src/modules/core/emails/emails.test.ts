import { createServerI18n } from '@rampflow/i18n/server';
import { STAFF_LOCALES } from '@rampflow/shared';
import type { TokenPurpose } from '@rampflow/shared/values';
import { render as renderEmail } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { env } from '../../../kernel/env.ts';
import { loadTemplateFile } from '../../../kernel/outbox.ts';
import { deriveToken } from '../../../kernel/tokens.ts';

// The account emails of U2 as the outbox worker renders them: every staff locale, no raw key,
// and the link carries the token derived from the payload's row id in the fragment.

const TEMPLATES: { id: string; purpose: TokenPurpose; path: string; idField: string }[] = [
  { id: 'core.magic-link', purpose: 'magic_link', path: '/auth/magic#', idField: 'authTokenId' },
  {
    id: 'core.password-reset',
    purpose: 'password_reset',
    path: '/auth/reset#',
    idField: 'authTokenId',
  },
  { id: 'core.invitation', purpose: 'invitation', path: '/invite#', idField: 'invitationId' },
];

describe('account emails', () => {
  for (const tpl of TEMPLATES) {
    for (const locale of STAFF_LOCALES) {
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
