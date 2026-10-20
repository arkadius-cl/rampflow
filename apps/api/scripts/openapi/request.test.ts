import { PutHours } from '@rampflow/shared/modules/booking/api.capacity';
import { ApiParty, HttpMethod, JsonSchemaType, StoryId } from '@rampflow/shared/values';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { file } from '../../src/kernel/describe.ts';
import type { Endpoint } from './model.ts';
import { describeRequest, openApiPath } from './request.ts';

const endpoint = (e: Partial<Endpoint>): Endpoint => ({
  method: HttpMethod.PUT,
  path: '/api/t/:orgId/capacity/hours',
  party: ApiParty.tenant,
  meta: {
    id: 'booking.capacity.putHours',
    stories: [StoryId.MD_04],
    description: '',
    responses: {},
  },
  validators: {},
  guards: [],
  ...e,
});

describe('describeRequest', () => {
  it('shows the body constraints the API enforces', () => {
    const { requestBody } = describeRequest(endpoint({ validators: { json: PutHours } }));
    const body = requestBody?.content['application/json'];
    expect(body?.schema).toMatchObject({
      type: JsonSchemaType.object,
      required: ['siteId', 'resourceId', 'rows'],
      properties: {
        siteId: { type: JsonSchemaType.string, format: 'uuid' },
        rows: {
          type: JsonSchemaType.array,
          maxItems: 70,
          items: {
            properties: { weekday: { type: JsonSchemaType.integer, minimum: 1, maximum: 7 } },
          },
        },
      },
    });
    expect(body?.schema.properties?.siteId).not.toHaveProperty('pattern');
    expect(body?.example).toEqual({
      siteId: '00000000-0000-4000-8000-000000000000',
      resourceId: '00000000-0000-4000-8000-000000000000',
      rows: [],
    });
  });

  it('describes path and query parameters, unvalidated path ids as UUIDs', () => {
    const { parameters, requestBody } = describeRequest(
      endpoint({
        method: HttpMethod.GET,
        path: '/api/t/:orgId/things/:code',
        validators: {
          param: z.object({ code: z.string().regex(/^[A-Z]{3}$/) }),
          query: z.object({ siteId: z.uuid(), day: z.iso.date().optional() }),
        },
      }),
    );
    expect(requestBody).toBeUndefined();
    expect(parameters).toEqual([
      {
        name: 'orgId',
        in: 'path',
        required: true,
        schema: { type: JsonSchemaType.string, format: 'uuid' },
      },
      {
        name: 'code',
        in: 'path',
        required: true,
        schema: { type: JsonSchemaType.string, pattern: '^[A-Z]{3}$' },
      },
      {
        name: 'siteId',
        in: 'query',
        required: true,
        schema: { type: JsonSchemaType.string, format: 'uuid' },
      },
      {
        name: 'day',
        in: 'query',
        required: false,
        schema: { type: JsonSchemaType.string, format: 'date' },
      },
    ]);
  });

  it('describes a raw upload body by its media types', () => {
    const { requestBody } = describeRequest(
      endpoint({
        meta: { ...endpoint({}).meta, body: file('image/png', 'image/jpeg') },
      }),
    );
    expect(Object.keys(requestBody?.content ?? {})).toEqual(['image/png', 'image/jpeg']);
  });
});

describe('openApiPath', () => {
  it('writes Hono parameters in OpenAPI syntax', () => {
    expect(openApiPath('/api/t/:orgId/sites/:siteId/docks')).toBe(
      '/api/t/{orgId}/sites/{siteId}/docks',
    );
  });
});
