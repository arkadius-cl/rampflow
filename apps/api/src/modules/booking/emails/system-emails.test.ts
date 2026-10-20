import { createServerI18n } from '@rampflow/i18n/server';
import { StaffLocale, values } from '@rampflow/shared/values';
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { loadTemplateFile } from '../../../kernel/outbox.ts';

// The emails the reminder and no-show jobs send (BK-07, BK-08), as the outbox worker renders them.

describe('job emails', () => {
  for (const id of ['booking.reminder', 'booking.no-show']) {
    it(`${id} renders in ${values(StaffLocale).join(', ')} without a raw key`, async () => {
      const template = await loadTemplateFile(id);
      expect(template.category).toBe('booking');
      for (const locale of values(StaffLocale)) {
        const i18n = await createServerI18n(locale);
        const example = { ...(template.example as object), locale };
        const { subject, body } = template.render(example, i18n.getFixedT(locale, 'booking'));
        const text = await render(body, { plainText: true });
        expect(subject).toContain('K7M2Q9XA');
        expect(`${subject}\n${text}`).not.toMatch(/(booking|email|no_show|reminder)\.[a-z]|\{\{/);
      }
    });
  }

  it('names the no-show deadline in site time', async () => {
    const template = await loadTemplateFile('booking.no-show');
    const de = await createServerI18n('de');
    const { body } = template.render(
      { ...(template.example as object), locale: StaffLocale.de },
      de.getFixedT('de', 'booking'),
    );
    expect(await render(body, { plainText: true })).toContain('bis 10:00 MEZ');
  });
});
