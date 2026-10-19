import { LOGO_MAX_BYTES, type LogoResponse } from '@rampflow/shared/modules/brand/api';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { entitlementOverride } from '../../core/schema.ts';
import { errorOf } from '../../core/staff/fixtures.ts';
import { jpegOf, PNG_1PX, SVG } from './fixtures.ts';

// TN-05 through /api/t/:orgId/brand/logo and /api/public/logos against Postgres.

const app = createApp({ clock: testClock(new Date()) });

let w: World;
beforeAll(async () => {
  w = await world();
});

const logoPath = (side: World['A']) => `/api/t/${side.tenantId}/brand/logo`;
const upload = (side: World['A'], type: string, bytes: Uint8Array) =>
  as(app, side.users.tenant_admin).put(logoPath(side), { raw: { type, bytes } });

describe('TN-05 logo', () => {
  it('stores a PNG and serves it publicly with immutable caching', async () => {
    const res = await upload(w.A, 'image/png', PNG_1PX);
    expect(res.status).toBe(200);
    const { logo } = (await res.json()) as LogoResponse;
    expect(logo).toMatchObject({ contentType: 'image/png', byteSize: PNG_1PX.length });
    expect(logo?.url).toMatch(new RegExp(`^/api/public/logos/${w.A.tenantId}/[0-9a-f]{64}$`));

    const served = await as(app, null).get(logo?.url ?? '');
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await served.arrayBuffer()).equals(PNG_1PX)).toBe(true);

    const read = (await (
      await as(app, w.A.users.tenant_admin).get(logoPath(w.A))
    ).json()) as LogoResponse;
    expect(read.logo?.url).toBe(logo?.url);
  });

  it('accepts a JPEG of exactly 256 KB and rejects one byte more with 422', async () => {
    const ok = await upload(w.B, 'image/jpeg', jpegOf(LOGO_MAX_BYTES));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as LogoResponse).logo?.contentType).toBe('image/jpeg');
    const tooBig = await upload(w.B, 'image/jpeg', jpegOf(LOGO_MAX_BYTES + 1));
    expect(tooBig.status).toBe(422);
    expect((await errorOf(tooBig)).details?.issues).toEqual([
      expect.objectContaining({ code: 'too_big' }),
    ]);
  });

  it('rejects SVG, also when it claims to be a PNG', async () => {
    for (const type of ['image/svg+xml', 'image/png']) {
      const res = await upload(w.B, type, SVG);
      expect(res.status).toBe(422);
      expect((await errorOf(res)).details?.issues).toEqual([
        expect.objectContaining({ code: 'invalid_format' }),
      ]);
    }
  });

  it('serves the logo only while brand.logo is on, and only under its current hash', async () => {
    const t = await world();
    const { logo } = (await (await upload(t.A, 'image/png', PNG_1PX)).json()) as LogoResponse;
    const url = logo?.url ?? '';
    expect((await as(app, null).get(url)).status).toBe(200);

    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: t.A.tenantId,
        key: 'brand.logo',
        value: { v: false },
        updatedBy: t.platformAdmin.id,
      });
    expect((await as(app, null).get(url)).status).toBe(404);
    expect((await as(app, t.A.users.tenant_admin).get(logoPath(t.A))).status).toBe(403);

    const otherHash = url.replace(/[0-9a-f]{64}$/, '0'.repeat(64));
    expect((await as(app, null).get(otherHash)).status).toBe(404);
    const otherTenant = url.replace(t.A.tenantId, t.B.tenantId);
    expect((await as(app, null).get(otherTenant)).status).toBe(404);
  });

  it('deletes the logo', async () => {
    const t = await world();
    const { logo } = (await (await upload(t.A, 'image/png', PNG_1PX)).json()) as LogoResponse;
    expect((await as(app, t.A.users.tenant_admin).delete(logoPath(t.A))).status).toBe(204);
    expect((await as(app, null).get(logo?.url ?? '')).status).toBe(404);
    const read = await as(app, t.A.users.tenant_admin).get(logoPath(t.A));
    expect(await read.json()).toEqual({ logo: null });
  });
});
