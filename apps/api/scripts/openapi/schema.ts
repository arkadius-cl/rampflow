import type { JsonSchemaType } from '@rampflow/shared/values';
/** The JSON Schema 2020-12 subset the generator writes and reads (OpenAPI 3.1 schema objects). */
export interface JsonSchema {
  $ref?: string;
  type?: JsonType | JsonType[];
  format?: string;
  pattern?: string;
  enum?: readonly (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
  description?: string;
  contentMediaType?: string;
  [key: string]: unknown;
}

export type JsonType = JsonSchemaType;
