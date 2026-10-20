import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ContentBody } from '@rampflow/shared/modules/safety/api.authoring';
import { PictogramId } from '@rampflow/shared/modules/safety/values';
import { DriverLocale, values } from '@rampflow/shared/values';
import { describe, expect, it } from 'vitest';
import { templateContent } from './platform.ts';

describe('platform template', () => {
  it('parses as content in every driver locale, with and without the quiz', () => {
    for (const locale of values(DriverLocale)) {
      for (const quiz of [true, false]) {
        const content = templateContent(locale, { quiz });
        expect(ContentBody.parse(content)).toEqual(content);
        expect(content.questions).toHaveLength(quiz ? 3 : 0);
      }
    }
  });

  it('uses only bundled pictograms, and every pictogram id ships one SVG', () => {
    const shared = dirname(
      createRequire(import.meta.url).resolve('@rampflow/shared/modules/safety/api.authoring'),
    );
    const files = readdirSync(join(shared, '../../assets/pictograms'));
    expect(files.map((f) => f.replace(/\.svg$/, '')).sort()).toEqual(
      [...values(PictogramId)].sort(),
    );
  });
});
