import { createServerI18n } from '@rampflow/i18n/server';
import { DriverLocale, StaffLocale, values } from '@rampflow/shared/values';
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { loadTemplateFile } from '../../../kernel/outbox.ts';
import { driverLinkUrl } from '../../driver/access.ts';

// Every template of U6a renders its example in every locale of its set, with no missing key.

const TEMPLATES = [
  { id: 'booking.confirmed', locales: values(StaffLocale) },
  { id: 'booking.changed', locales: values(StaffLocale) },
  { id: 'booking.cancelled', locales: values(StaffLocale) },
  { id: 'driver.link', locales: values(DriverLocale) },
] as const;

describe('booking email templates', () => {
  for (const { id, locales } of TEMPLATES) {
    it(`${id} renders in ${locales.join(', ')}`, async () => {
      const template = await loadTemplateFile(id);
      expect(template.category).toBe('booking');
      const ns = id.split('.')[0] ?? '';
      for (const locale of locales) {
        const i18n = await createServerI18n(locale);
        const example = { ...(template.example as object), locale };
        const { subject, body } = template.render(example, i18n.getFixedT(locale, ns));
        const text = await render(body, { plainText: true });
        expect(subject).toContain('K7M2Q9XA');
        expect(`${subject}\n${text}`).not.toMatch(/(booking|link-email)\.[a-z]/);
        expect(text).toContain('Hafenstr. 1');
      }
    });
  }

  it('shows the slot in site time with the zone label of the recipient', async () => {
    const template = await loadTemplateFile('booking.confirmed');
    const de = await createServerI18n('de');
    const { body } = template.render(
      { ...(template.example as object), locale: StaffLocale.de },
      de.getFixedT('de', 'booking'),
    );
    expect(await render(body, { plainText: true })).toContain('09:00 MEZ – 10:00 MEZ');
  });

  it('derives the driver link at send time from the row id', async () => {
    const template = await loadTemplateFile('driver.link');
    const en = await createServerI18n('en');
    const example = template.example as { driverAccessId: string };
    const { body } = template.render(example, en.getFixedT('pl', 'driver'));
    expect(await render(body)).toContain(driverLinkUrl(example.driverAccessId as never));
  });
});
