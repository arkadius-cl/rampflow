import { EmailTemplate, values } from '@rampflow/shared/values';
import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { oneOf } from './ids.ts';

const probe = pgTable('probe', { template: text('template') });
const render = (values: readonly string[]) =>
  new PgDialect().sqlToQuery(oneOf(probe.template, values)).sql;

describe('oneOf', () => {
  it('quotes dotted and dashed ids such as email templates', () => {
    expect(render([EmailTemplate.booking_no_show, EmailTemplate.core_magic_link])).toBe(
      `"probe"."template" in ('booking.no-show', 'core.magic-link')`,
    );
    expect(() => render(values(EmailTemplate))).not.toThrow();
  });

  it('rejects a value that could end the quoted literal', () => {
    expect(() => render(["x') or ('1"])).toThrow('Bad enum value');
  });
});
