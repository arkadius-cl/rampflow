import { createHash } from 'node:crypto';
import type { ContentBody } from '@rampflow/shared/modules/safety/api.authoring';

type Hashed = Pick<ContentBody, 'title' | 'blocks' | 'questions' | 'statement'>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** sha256 of the canonical JSON of what the driver reads and answers (data model). */
export function contentHash({ title, blocks, questions, statement }: Hashed): Buffer {
  return createHash('sha256').update(canonical({ title, blocks, questions, statement })).digest();
}
