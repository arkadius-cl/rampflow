import type { JsonSchema } from './schema.ts';

// Request body examples for Bruno and Postman (design D10): the first enum value, the lower bound,
// fixed values for formats, required fields only. Fixed values keep the document date-independent.

const BY_FORMAT: Record<string, string> = {
  uuid: '00000000-0000-4000-8000-000000000000',
  date: '2026-01-05',
  'date-time': '2026-01-05T08:00:00.000Z',
  email: 'user@example.com',
  uri: 'https://example.com',
  url: 'https://example.com',
};

/** Samples for the patterns of packages/shared/src/time, which a regex cannot be sampled from. */
const BY_PATTERN: Record<string, string> = {
  '^([01]\\d|2[0-3]):[0-5]\\d$': '08:00',
  '^(([01]\\d|2[0-3]):[0-5]\\d|24:00)$': '16:00',
  '^\\d{4}-\\d{2}-\\d{2}T([01]\\d|2[0-3]):[0-5]\\d$': '2026-01-05T08:00',
};

export function sample(schema: JsonSchema, components: Record<string, JsonSchema> = {}): unknown {
  if (schema.$ref) {
    const target = components[schema.$ref.replace('#/components/schemas/', '')];
    return target ? sample(target, components) : null;
  }
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (alternatives) {
    const first = alternatives.find((s) => s.type !== 'null') ?? alternatives[0];
    return first ? sample(first, components) : null;
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  switch (type) {
    case 'string':
      return sampleString(schema);
    case 'integer':
    case 'number':
      return schema.minimum ?? (schema.exclusiveMinimum ?? 0) + 1;
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'array': {
      const items = schema.items ? sample(schema.items, components) : null;
      return Array.from({ length: schema.minItems ?? 0 }, () => items);
    }
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const name of schema.required ?? []) {
        const property = schema.properties?.[name];
        if (property) out[name] = sample(property, components);
      }
      return out;
    }
    default:
      return null;
  }
}

function sampleString(schema: JsonSchema): string {
  if (schema.format && BY_FORMAT[schema.format]) return BY_FORMAT[schema.format] as string;
  if (schema.pattern && BY_PATTERN[schema.pattern]) return BY_PATTERN[schema.pattern] as string;
  const min = schema.minLength ?? 1;
  return 'example'.padEnd(min, 'x').slice(0, Math.max(min, Math.min(7, schema.maxLength ?? 7)));
}
