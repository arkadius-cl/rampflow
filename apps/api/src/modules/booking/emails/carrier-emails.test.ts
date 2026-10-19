import { createServerI18n } from '@rampflow/i18n/server';
import { STAFF_LOCALES } from '@rampflow/shared';
import { render as renderEmail } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { env } from '../../../kernel/env.ts';
import { loadTemplateFile } from '../../../kernel/outbox.ts';
import { deriveToken } from '../../../kernel/tokens.ts';

// The carrier network emails as the outbox worker renders them: account category (they send
// while notify.email is off), every staff locale, no raw key, and links with the derived token.

const TEMPLATES: { id: string; link: (example: Record<string, string>) => string | null }[] = [
  {
    id: 'booking.carrier-invitation',
    link: (e) =>
      `/carrier-invite#${deriveToken('carrier_invitation', e.carrierInvitationId as string)}`,
  },
  {
    id: 'booking.registration-verify',
    link: (e) => `/carrier-registration#${deriveToken('registration', e.registrationId as string)}`,
  },
  { id: 'booking.registration-approved', link: (e) => `/c/${e.carrierId}/book` },
  { id: 'booking.registration-rejected', link: () => null },
];

describe('carrier network emails', () => {
  for (const tpl of TEMPLATES) {
    for (const locale of STAFF_LOCALES) {
      it(`${tpl.id} renders in ${locale}`, async () => {
        const template = await loadTemplateFile(tpl.id);
        expect(template.category).toBe('account');
        const i18n = await createServerI18n(locale);
        const t = i18n.getFixedT(locale, 'booking');
        const { subject, body } = template.render(template.example, t);
        const text = await renderEmail(body, { plainText: true });
        expect(subject).not.toMatch(/carriers\.|registration\.|\{\{/);
        expect(text).not.toMatch(/carriers\.email|registration\.email|\{\{/);
        const link = tpl.link(template.example as Record<string, string>);
        if (link) expect(text).toContain(`${env.APP_ORIGIN}${link}`);
      });
    }
  }

  it('the sign-in prompt for a known email differs from the verification text', async () => {
    const template = await loadTemplateFile('booking.registration-verify');
    const t = (await createServerI18n('en')).getFixedT('en', 'booking');
    const verify = template.render(template.example, t);
    const known = template.render({ ...(template.example as object), knownAccount: true }, t);
    expect(verify.subject).toBe('Confirm your registration with Acme Logistics');
    expect(known.subject).toBe('Sign in to finish your registration with Acme Logistics');
  });

  it('the rejection carries the reason', async () => {
    const template = await loadTemplateFile('booking.registration-rejected');
    const t = (await createServerI18n('de')).getFixedT('de', 'booking');
    const text = await renderEmail(template.render(template.example, t).body, { plainText: true });
    expect(text).toContain('Begründung: We only work with carriers that hold ADR approval.');
  });
});
