import { createServerI18n } from '@rampflow/i18n/server';
import { STAFF_LOCALES } from '@rampflow/shared';
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { env } from '../../../kernel/env.ts';
import { loadTemplateFile } from '../../../kernel/outbox.ts';

describe('privacy.inactive-notice (PL-05)', () => {
  it(`is an account email that renders in ${STAFF_LOCALES.join(', ')} with the deletion date`, async () => {
    const template = await loadTemplateFile('privacy.inactive-notice');
    expect(template.category).toBe('account');
    for (const locale of STAFF_LOCALES) {
      const i18n = await createServerI18n(locale);
      const { subject, body } = template.render(
        { locale, deletesOn: '2026-12-01' },
        i18n.getFixedT(locale, 'privacy'),
      );
      const text = await render(body, { plainText: true });
      expect(`${subject}\n${text}`).not.toMatch(/(privacy|email|inactive)\.[a-z]|\{\{/);
      expect(text).toContain(`${env.APP_ORIGIN}/login`);
      expect(text).toMatch(/2026|1\. Dezember|1 December|1 grudnia/);
    }
  });
});
