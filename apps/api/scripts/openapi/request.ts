import { ParameterLocation } from '@rampflow/shared/values';
import * as z from 'zod';
import type { Endpoint } from './model.ts';
import { sample } from './sampler.ts';
import type { JsonSchema } from './schema.ts';

export interface Parameter {
  name: string;
  in: ParameterLocation;
  required: boolean;
  schema: JsonSchema;
  description?: string;
}

export interface RequestBody {
  required: true;
  content: Record<string, { schema: JsonSchema; example?: unknown }>;
}

export interface RequestDescription {
  parameters: Parameter[];
  requestBody?: RequestBody;
}

/** Formats that already say what zod's generated pattern says. */
const SELF_DESCRIBING = new Set(['uuid', 'date', 'date-time', 'email']);

/** zod 4's JSON Schema of the input side, without `$schema` and redundant patterns. */
export function inputSchema(schema: z.ZodType): JsonSchema {
  const { $schema: _, ...json } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    override: ({ jsonSchema }) => {
      if (typeof jsonSchema.format === 'string' && SELF_DESCRIBING.has(jsonSchema.format)) {
        delete jsonSchema.pattern;
      }
    },
  }) as JsonSchema;
  return json;
}

export const openApiPath = (path: string) => path.replace(/:(\w+)/g, '{$1}');

const pathParams = (path: string) => [...path.matchAll(/:(\w+)/g)].map((m) => m[1] as string);

/** A UUID unless the route validates the parameter (design D7). */
const UNVALIDATED_PARAM: JsonSchema = { type: 'string', format: 'uuid' };

export function describeRequest(e: Endpoint): RequestDescription {
  const param = e.validators.param && inputSchema(e.validators.param);
  const query = e.validators.query && inputSchema(e.validators.query);
  const parameters: Parameter[] = pathParams(e.path).map((name) => ({
    name,
    in: ParameterLocation.path,
    required: true,
    schema: param?.properties?.[name] ?? UNVALIDATED_PARAM,
  }));
  for (const [name, schema] of Object.entries(query?.properties ?? {})) {
    const { description, ...rest } = schema;
    parameters.push({
      name,
      in: ParameterLocation.query,
      required: query?.required?.includes(name) ?? false,
      schema: rest,
      ...(typeof description === 'string' ? { description } : {}),
    });
  }
  if (e.validators.json) {
    const schema = inputSchema(e.validators.json);
    const content = { 'application/json': { schema, example: sample(schema) } };
    return { parameters, requestBody: { required: true, content } };
  }
  if (e.meta.body) {
    const content = Object.fromEntries(
      e.meta.body.mediaTypes.map((type) => [type, { schema: { contentMediaType: type } }]),
    );
    return { parameters, requestBody: { required: true, content } };
  }
  return { parameters };
}
