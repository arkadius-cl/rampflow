import { Validator } from '@seriousme/openapi-schema-validator';
import { describe, expect, it } from 'vitest';
import { generate } from './openapi.ts';

describe('pnpm api:docs', () => {
  const out = generate();
  const doc = JSON.parse(out.document);

  it('produces a valid OpenAPI 3.1 document', async () => {
    const result = await new Validator().validate(doc);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
    expect(doc.openapi).toMatch(/^3\.1\./);
  });

  it('shows party, permission and entitlement from the guards of the yard check-in', () => {
    const checkIn = doc.paths['/api/t/{orgId}/yard/bookings/{bookingId}/check-in'].post;
    expect(checkIn).toMatchObject({
      'x-party': 'tenant',
      'x-permission': ['yard.gate'],
      'x-entitlement': ['yard'],
      'x-stories': ['YD-02'],
      tags: ['Yard'],
    });
    expect(Object.keys(checkIn.responses)).toEqual(['200', '401', '403', '404', '422']);
  });

  it('declares the session cookie, the driver cookie and anonymous routes', () => {
    expect(doc.security).toEqual([{ session: [] }]);
    expect(doc.components.securitySchemes).toEqual({
      session: { type: 'apiKey', in: 'cookie', name: 'rf_session' },
      driver: { type: 'apiKey', in: 'cookie', name: 'rf_driver' },
    });
    expect(doc.paths['/api/auth/login'].post.security).toEqual([]);
    expect(doc.paths['/api/driver/booking'].get.security).toEqual([{ driver: [] }]);
    expect(doc.servers[0].url).toBe('{appOrigin}');
  });

  it('references a named response type as a component', () => {
    const create = doc.paths['/api/t/{orgId}/capacity/resources'].post;
    expect(create.responses['201'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ResourceView',
    });
    expect(doc.components.schemas.ResourceView.required).toContain('dockIds');
  });
});
